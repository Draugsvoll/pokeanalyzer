import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import {
  fetchPokeTraceSealedPage,
  type PokeTraceSealedPage,
} from "../services/pokeTraceApi.js";
import {
  expiredSealedPricesDelete,
  obsoleteSealedProductDeletes,
  sealedProductAndDailyPriceUpserts,
} from "../services/pokeTraceSealedStore.js";
import { generateAndSavePokeTraceSealedCatalog } from "./pokeTraceSealedCatalogGenerationJob.js";

type RefreshDatabase = Pick<Client, "batch" | "execute">;

type RefreshDependencies = {
  createCrawlId?: () => string;
  database: RefreshDatabase;
  fetchPage?: (
    apiKey: string,
    filters: Record<string, string>,
  ) => Promise<PokeTraceSealedPage>;
  log?: (message: string) => void;
  onCheckpoint?: (checkpoint: PokeTraceSealedRefreshCheckpoint) => void;
  requestGapMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export type PokeTraceSealedRefreshCheckpoint = {
  complete: boolean;
  nextCursor: string | null;
  pages: number;
  products: number;
  snapshots: number;
};

export type PokeTraceSealedRefreshResult = {
  pages: number;
  products: number;
  removedProducts: number;
  snapshots: number;
};

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function refreshPokeTraceSealedProducts(
  apiKey: string,
  recordedAt: string,
  assertHeld: () => void,
  dependencies: RefreshDependencies,
): Promise<PokeTraceSealedRefreshResult> {
  const {
    createCrawlId = randomUUID,
    database,
    fetchPage = fetchPokeTraceSealedPage,
    log = console.log,
    onCheckpoint,
    requestGapMs = 2_100,
    sleep = defaultSleep,
  } = dependencies;
  const crawlId = createCrawlId();
  let cursor: string | null = null;
  let pages = 0;
  let products = 0;
  let snapshots = 0;
  const seenCursors = new Set<string>();
  onCheckpoint?.({
    complete: false,
    nextCursor: null,
    pages,
    products,
    snapshots,
  });

  for (;;) {
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

    const statements = page.data.flatMap((product) => {
      const upserts = sealedProductAndDailyPriceUpserts(
        product,
        recordedAt,
        crawlId,
      );
      snapshots += upserts.length - 1;
      return upserts;
    });
    if (statements.length > 0) await database.batch(statements, "write");
    assertHeld();

    pages += 1;
    products += page.data.length;
    const checkpoint = {
      complete: !page.pagination.hasMore,
      nextCursor: page.pagination.hasMore ? nextCursor : null,
      pages,
      products,
      snapshots,
    };
    onCheckpoint?.(checkpoint);
    log(
      `Sealed refresh checkpoint: ${products} products and ${snapshots} snapshots across ${pages} page(s); ${checkpoint.complete ? "crawl complete" : `next cursor ${checkpoint.nextCursor}`}`,
    );
    if (!page.pagination.hasMore) break;
    cursor = nextCursor;
    await sleep(requestGapMs);
  }

  if (products === 0) {
    throw new Error("PokeTrace sealed refresh returned no products");
  }
  const reconciliation = await database.batch(
    obsoleteSealedProductDeletes(crawlId),
    "write",
  );
  const removedProducts = Number(reconciliation[1]?.rowsAffected ?? 0);
  assertHeld();
  await database.execute(expiredSealedPricesDelete(recordedAt, 40));
  assertHeld();
  await generateAndSavePokeTraceSealedCatalog(database, assertHeld);
  return { pages, products, removedProducts, snapshots };
}
