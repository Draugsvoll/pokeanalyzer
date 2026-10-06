import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  ensurePokeTraceCatalogStore,
  loadStoredPokeTraceCatalog,
} from "../services/pokeTraceCatalogStore.js";
import { completePokeTraceDailyRefresh } from "./pokeTraceDailyRefreshJob.js";
import {
  ensurePokeTraceFilterOptionsStore,
  loadStoredPokeTraceFilterOptions,
} from "../services/pokeTraceFilterOptionsStore.js";

const execFileAsync = promisify(execFile);

async function seedCronTestDatabase(databaseUrl: string, holdLock = false) {
  const seedScript = `
    import { createClient } from "@libsql/client";

    const database = createClient({
      url: process.env.POKETRACE_CRON_TEST_DATABASE_URL,
    });
    try {
      await database.execute(\`
        CREATE TABLE poketrace_cards (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          card_number TEXT,
          set_name TEXT,
          rarity TEXT,
          variant TEXT,
          image_url TEXT,
          tcgplayer_id TEXT,
          raw_json TEXT NOT NULL,
          saved_responses TEXT NOT NULL DEFAULT '{}',
          fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          price_refreshed_at TEXT,
          price_refresh_retry_at TEXT,
          price_refresh_failures INTEGER NOT NULL DEFAULT 0,
          tcg_market_comparisons TEXT NOT NULL DEFAULT '{}',
          market_price_history TEXT,
          market_price_history_fetched_at TEXT
        )
      \`);
      await database.execute({
        sql: \`
          INSERT INTO poketrace_cards
            (id, name, set_name, raw_json, price_refreshed_at)
          VALUES (?, ?, ?, ?, ?)
        \`,
        args: [
          "cron-card",
          "Cron Test Card",
          "Cron Test Set",
          JSON.stringify({
            currency: "USD",
            prices: { tcgplayer: { NEAR_MINT: { avg: 10 } } },
          }),
          "2999-01-01T00:00:00.000Z",
        ],
      });
      if (process.env.POKETRACE_CRON_TEST_HOLD_LOCK === "true") {
        await database.execute(\`
          CREATE TABLE poketrace_job_locks (
            name TEXT PRIMARY KEY,
            token TEXT NOT NULL,
            expires_at INTEGER NOT NULL
          )
        \`);
        await database.execute(\`
          INSERT INTO poketrace_job_locks (name, token, expires_at)
          VALUES ('poketrace-maintenance', 'held-by-test', unixepoch('now') + 3600)
        \`);
      }
    } finally {
      database.close();
    }
  `;

  await execFileAsync(
    process.execPath,
    ["--input-type=module", "--eval", seedScript],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        POKETRACE_CRON_TEST_DATABASE_URL: databaseUrl,
        POKETRACE_CRON_TEST_HOLD_LOCK: String(holdLock),
      },
    },
  );
}

test("a successful daily refresh stores the regenerated catalog before completing", async () => {
  const database = createClient({ url: "file::memory:" });
  await database.execute(`
    CREATE TABLE poketrace_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      card_number TEXT,
      set_name TEXT,
      rarity TEXT,
      variant TEXT,
      image_url TEXT,
      raw_json TEXT NOT NULL,
      tcg_market_comparisons TEXT NOT NULL DEFAULT '{}'
    )
  `);
  await ensurePokeTraceCatalogStore(database);
  await ensurePokeTraceFilterOptionsStore(database);
  await database.execute({
    sql: `
      INSERT INTO poketrace_cards
        (id, name, card_number, set_name, rarity, variant, image_url, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      "refreshed-card",
      "Charizard",
      "004/102",
      "Base Set",
      "Holo Rare",
      "Unlimited Holofoil",
      "https://example.test/charizard.webp",
      JSON.stringify({
        currency: "USD",
        prices: { tcgplayer: { NEAR_MINT: { avg: 420 } } },
      }),
    ],
  });

  let lockChecks = 0;
  const completion = await completePokeTraceDailyRefresh(
    database,
    () => {
      lockChecks += 1;
    },
    0,
  );
  const storedCatalog = await loadStoredPokeTraceCatalog(database);
  const storedFilterOptions = await loadStoredPokeTraceFilterOptions(database);

  assert.deepEqual(completion, { catalogCards: 1, result: "SUCCESS" });
  assert.equal(lockChecks, 2);
  assert.equal(storedCatalog?.cards[0]?.id, "refreshed-card");
  assert.deepEqual(storedFilterOptions, {
    schemaVersion: 2,
    generatedAt: storedCatalog?.generatedAt,
    rarities: ["Holo Rare"],
    setNames: ["Base Set"],
    setSummaries: [
      {
        asOf: storedCatalog?.generatedAt,
        comparableCards: 0,
        currency: "USD",
        pricedCards: 1,
        setName: "Base Set",
        sevenDayChangePercent: null,
        uniqueCards: 1,
      },
    ],
  });
  database.close();
});

test("the daily refresh cron script regenerates the stored catalog", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "poketrace-daily-refresh-"),
  );
  const databasePath = path.join(temporaryDirectory, "poketrace.sqlite");
  const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;

  try {
    await seedCronTestDatabase(databaseUrl);

    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "--import",
        "tsx",
        path.resolve("server/scripts/refreshOldestPokeTraceCards.ts"),
        "1",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          POKETRACE_API_KEY: "test-api-key",
          POKETRACE_DATABASE_URL: databaseUrl,
          POKETRACE_REQUEST_GAP_MS: "0",
        },
      },
    );

    assert.match(stdout, /Search catalog: 1 cards saved/);
    const verificationScript = `
      import { createClient } from "@libsql/client";

      const database = createClient({
        url: process.env.POKETRACE_CRON_TEST_DATABASE_URL,
      });
      try {
        const result = await database.execute(
          "SELECT payload_json FROM poketrace_filter_options WHERE id = 'current'",
        );
        console.log(result.rows[0]?.payload_json ?? "null");
      } finally {
        database.close();
      }
    `;
    const { stdout: storedOptionsJson } = await execFileAsync(
      process.execPath,
      ["--input-type=module", "--eval", verificationScript],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          POKETRACE_CRON_TEST_DATABASE_URL: databaseUrl,
        },
      },
    );
    const storedFilterOptions = JSON.parse(storedOptionsJson) as {
      setNames: string[];
    };
    assert.deepEqual(storedFilterOptions.setNames, ["Cron Test Set"]);
  } finally {
    await rm(temporaryDirectory, {
      force: true,
      maxRetries: 3,
      recursive: true,
      retryDelay: 100,
    });
  }
});

test("the daily refresh cron script fails when the maintenance lock is held", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "poketrace-daily-refresh-lock-"),
  );
  const databasePath = path.join(temporaryDirectory, "poketrace.sqlite");
  const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;

  try {
    await seedCronTestDatabase(databaseUrl, true);

    await assert.rejects(
      execFileAsync(
        process.execPath,
        [
          "--import",
          "tsx",
          path.resolve("server/scripts/refreshOldestPokeTraceCards.ts"),
          "1",
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            POKETRACE_API_KEY: "test-api-key",
            POKETRACE_DATABASE_URL: databaseUrl,
            POKETRACE_REQUEST_GAP_MS: "0",
          },
        },
      ),
      (error: unknown) => {
        const failure = error as {
          code?: number;
          stderr?: string;
          stdout?: string;
        };
        assert.equal(failure.code, 1);
        assert.match(
          failure.stderr ?? "",
          /PokeTrace maintenance lock is already held; refresh not started/,
        );
        assert.match(failure.stdout ?? "", /Result: FAILED/);
        return true;
      },
    );
  } finally {
    await rm(temporaryDirectory, {
      force: true,
      maxRetries: 3,
      recursive: true,
      retryDelay: 100,
    });
  }
});
