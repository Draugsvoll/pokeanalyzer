import "dotenv/config";
import { pkmnPricesDb, pkmnPricesReady } from "../db/pkmnPricesDb.js";

const apiKey = process.env.PKMNPRICES_API_KEY?.trim();
if (!apiKey) {
  console.error("Set PKMNPRICES_API_KEY before importing cards");
  process.exit(1);
}

const pageSize = 100;
const maxPages = 40;
const importName = "english-first-4000";
const requestGapMs = 2500;

type CardSummary = {
  id: number;
  name: string;
  number?: string | null;
  rarity?: string | null;
  image_url?: string | null;
  set?: { name?: string | null };
};

function isCardSummary(value: unknown): value is CardSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const card = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(card.id) &&
    Number(card.id) > 0 &&
    typeof card.name === "string"
  );
}

function parsePage(value: unknown): CardSummary[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("PkmnPrices returned an invalid card page");
  }
  const data = (value as { data?: unknown }).data;
  if (
    !Array.isArray(data) ||
    data.length > pageSize ||
    !data.every(isCardSummary)
  ) {
    throw new Error("PkmnPrices returned an invalid card page");
  }
  return data;
}

const stringOrNull = (value: unknown) =>
  typeof value === "string" ? value : null;

try {
  await pkmnPricesReady;
  const progress = await pkmnPricesDb.execute({
    sql: "SELECT next_page FROM pkmn_import_progress WHERE name = ?",
    args: [importName],
  });
  const startPage = Number(progress.rows[0]?.next_page ?? 1);
  if (startPage > maxPages) {
    console.log("The first 4,000 English card summaries are already imported");
  }

  for (let page = startPage; page <= maxPages; page += 1) {
    if (page > startPage) {
      await new Promise((resolve) => setTimeout(resolve, requestGapMs));
    }
    const params = new URLSearchParams({
      language: "English",
      per_page: String(pageSize),
      page: String(page),
    });
    const response = await fetch(
      `https://api.pkmnprices.com/v1/cards?${params}`,
      {
        headers: { "X-API-Key": apiKey },
      },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      const reason = body?.error?.message ?? `HTTP ${response.status}`;
      throw new Error(`Card list page ${page} failed: ${reason}`);
    }
    const cards = parsePage(await response.json());

    await pkmnPricesDb.batch(
      [
        ...cards.map((card) => ({
          sql: `
            INSERT INTO pkmn_cards
              (id, name, number, set_name, rarity, image_url, raw_json, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
            ON CONFLICT(id) DO NOTHING
          `,
          args: [
            card.id,
            card.name,
            stringOrNull(card.number),
            stringOrNull(card.set?.name),
            stringOrNull(card.rarity),
            stringOrNull(card.image_url),
            JSON.stringify(card),
          ],
        })),
        {
          sql: `
            INSERT INTO pkmn_import_progress (name, next_page)
            VALUES (?, ?)
            ON CONFLICT(name) DO UPDATE SET next_page = excluded.next_page
          `,
          args: [importName, page + 1],
        },
      ],
      "write",
    );
    console.log(
      `Saved English card page ${page}/${maxPages} (${cards.length} summaries)`,
    );
    if (cards.length < pageSize) break;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  pkmnPricesDb.close();
}
