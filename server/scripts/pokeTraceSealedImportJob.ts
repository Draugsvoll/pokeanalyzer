import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import {
  fetchPokeTraceSealedPage,
  type PokeTraceSealedPage,
} from "../services/pokeTraceApi.js";
import {
  obsoleteSealedProductDeletes,
  sealedProductUpsert,
} from "../services/pokeTraceSealedStore.js";
import { loadStoredPokeTraceSealedCatalog } from "../services/pokeTraceSealedCatalogStore.js";
import { generateAndSavePokeTraceSealedCatalog } from "./pokeTraceSealedCatalogGenerationJob.js";

export const POKETRACE_SEALED_IMPORT_NAME = "english-us-sealed";
export const POKETRACE_SEALED_REQUEST_GAP_MS = 2_100;

type SealedImportDatabase = Pick<Client, "batch" | "execute">;

type SealedImportDependencies = {
  createCrawlId?: () => string;
  database: SealedImportDatabase;
  fetchPage?: (
    apiKey: string,
    filters: Record<string, string>,
  ) => Promise<PokeTraceSealedPage>;
  log?: (message: string) => void;
  onCheckpoint?: (checkpoint: PokeTraceSealedImportCheckpoint) => void;
  publishCatalog?: typeof generateAndSavePokeTraceSealedCatalog;
  requestGapMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export type PokeTraceSealedImportCheckpoint = {
  complete: boolean;
  finalized: boolean;
  importedCount: number;
  nextCursor: string | null;
};

export type PokeTraceSealedImportResult = {
  complete: boolean;
  importedCount: number;
  nextCursor: string | null;
  removedProducts: number;
  storedCount: number;
};

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function importPokeTraceSealedProducts(
  apiKey: string,
  assertHeld: () => void,
  dependencies: SealedImportDependencies,
  target = Infinity,
): Promise<PokeTraceSealedImportResult> {
  const {
    createCrawlId = randomUUID,
    database,
    fetchPage = fetchPokeTraceSealedPage,
    log = console.log,
    onCheckpoint,
    publishCatalog = generateAndSavePokeTraceSealedCatalog,
    requestGapMs = POKETRACE_SEALED_REQUEST_GAP_MS,
    sleep = defaultSleep,
  } = dependencies;

  const progress = await database.execute({
    sql: `
      SELECT next_cursor, imported_count, complete, finalized, crawl_id
      FROM poketrace_sealed_import_progress
      WHERE name = ?
    `,
    args: [POKETRACE_SEALED_IMPORT_NAME],
  });
  let cursor =
    progress.rows[0]?.next_cursor == null
      ? null
      : String(progress.rows[0].next_cursor);
  let importedCount = Number(progress.rows[0]?.imported_count ?? 0);
  let complete = Number(progress.rows[0]?.complete ?? 0) === 1;
  let finalized = Number(progress.rows[0]?.finalized ?? 0) === 1;
  const storedCrawlId =
    typeof progress.rows[0]?.crawl_id === "string" &&
    progress.rows[0].crawl_id.trim()
      ? progress.rows[0].crawl_id.trim()
      : null;
  const canReconcile = storedCrawlId !== null || (!complete && cursor === null);
  const crawlId = storedCrawlId ?? createCrawlId();
  const seenCursors = new Set<string>();
  onCheckpoint?.({
    complete,
    finalized,
    importedCount,
    nextCursor: complete ? null : cursor,
  });

  while (!complete && importedCount < target) {
    if (cursor) seenCursors.add(cursor);
    const page = await fetchPage(apiKey, cursor ? { cursor } : {});
    assertHeld();
    const nextCursor = page.pagination.nextCursor;
    if (page.pagination.hasMore) {
      if (!nextCursor) {
        throw new Error(
          "PokeTrace sealed page indicated more results without a next cursor",
        );
      }
      if (nextCursor === cursor || seenCursors.has(nextCursor)) {
        throw new Error("PokeTrace repeated a sealed pagination cursor");
      }
    }

    const nextImportedCount = importedCount + page.data.length;
    const nextComplete = !page.pagination.hasMore;
    await database.batch(
      [
        ...page.data.map((product) => sealedProductUpsert(product, crawlId)),
        {
          sql: `
            INSERT INTO poketrace_sealed_import_progress
              (name, next_cursor, imported_count, complete, finalized, crawl_id)
            VALUES (?, ?, ?, ?, 0, ?)
            ON CONFLICT(name) DO UPDATE SET
              next_cursor = excluded.next_cursor,
              imported_count = excluded.imported_count,
              complete = excluded.complete,
              finalized = 0,
              crawl_id = excluded.crawl_id
          `,
          args: [
            POKETRACE_SEALED_IMPORT_NAME,
            nextCursor,
            nextImportedCount,
            nextComplete ? 1 : 0,
            crawlId,
          ],
        },
      ],
      "write",
    );
    assertHeld();

    importedCount = nextImportedCount;
    complete = nextComplete;
    finalized = false;
    cursor = nextCursor;
    const checkpoint = {
      complete,
      finalized,
      importedCount,
      nextCursor: complete ? null : cursor,
    };
    onCheckpoint?.(checkpoint);
    log(
      `Sealed import checkpoint: ${importedCount} products; ${complete ? "crawl complete" : `next cursor ${cursor}`}`,
    );

    if (!complete && importedCount < target) {
      await sleep(requestGapMs);
    }
  }

  let removedProducts = 0;
  if (complete && !finalized) {
    assertHeld();
    if (canReconcile) {
      const reconciliation = await database.batch(
        obsoleteSealedProductDeletes(crawlId),
        "write",
      );
      removedProducts = Number(reconciliation[1]?.rowsAffected ?? 0);
      assertHeld();
    }

    await publishCatalog(database, assertHeld);
    assertHeld();
    const finalization = await database.execute({
      sql: `
        UPDATE poketrace_sealed_import_progress
        SET finalized = 1
        WHERE name = ? AND complete = 1 AND finalized = 0
      `,
      args: [POKETRACE_SEALED_IMPORT_NAME],
    });
    if (finalization.rowsAffected !== 1) {
      throw new Error("PokeTrace sealed import finalization was not recorded");
    }
    finalized = true;
    assertHeld();
    onCheckpoint?.({
      complete: true,
      finalized,
      importedCount,
      nextCursor: null,
    });
    log(
      `Sealed import finalized: ${importedCount} products; ${removedProducts} obsolete products removed`,
    );
  }

  const stored = await database.execute(
    "SELECT COUNT(*) AS count FROM poketrace_sealed_products",
  );
  if (
    complete &&
    finalized &&
    !(await loadStoredPokeTraceSealedCatalog(database))
  ) {
    await publishCatalog(database, assertHeld);
  }
  return {
    complete,
    importedCount,
    nextCursor: complete ? null : cursor,
    removedProducts,
    storedCount: Number(stored.rows[0]?.count ?? 0),
  };
}
