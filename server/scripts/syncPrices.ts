import { dbRun } from "../db/db.js";
import { logError } from "../security/logging.js";
import type { PokemonTcgApiCard } from "../types/PokemonTcgApiCard";
import { getCardsPage, waitBetweenRequests, PAGE_SIZE } from "../services/pokemonTcgApi";

type SqlParam = string | number | null;

async function insertPriceSnapshot(card: PokemonTcgApiCard): Promise<void> {
  await dbRun(
    `
    INSERT OR REPLACE INTO price_snapshots
    (
      card_id,
      recorded_at,
      tcgplayer_prices,
      cardmarket_prices,
      tcgplayer_updated_at,
      cardmarket_updated_at
    )
    VALUES (?, date('now'), ?, ?, ?, ?)
    `,
    [
      card.id,
      JSON.stringify(card.tcgplayer?.prices ?? null),
      JSON.stringify(card.cardmarket?.prices ?? null),
      card.tcgplayer?.updatedAt ?? null,
      card.cardmarket?.updatedAt ?? null,
    ] as SqlParam[],
  );
}

async function syncPrices(): Promise<void> {
  let page = 1;
  let totalSnapshots = 0;

  while (true) {
    console.log(`Fetching price page ${page}`);

    const cards = await getCardsPage(page);

    for (const card of cards) {
      await insertPriceSnapshot(card);
      totalSnapshots++;
    }

    console.log(`Saved ${totalSnapshots} price snapshots so far`);

    if (cards.length < PAGE_SIZE) break;

    page++;
    await waitBetweenRequests();
  }

  console.log("Done syncing prices");
}

syncPrices().catch((err: unknown) => {
  logError("Price sync failed", err);
});
