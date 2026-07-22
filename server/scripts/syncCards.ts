import { dbRun } from "../db/db.js";
import { logError } from "../security/logging.js";
import type { PokemonTcgApiCard } from "../types/PokemonTcgApiCard";
import { getCardsPage, waitBetweenRequests, PAGE_SIZE } from "../services/pokemonTcgApi";

type SqlParam = string | number | null;

async function insertCard(card: PokemonTcgApiCard): Promise<void> {
  await dbRun(
    `
    INSERT OR REPLACE INTO cards
    (id, number, name, set_id, set_name, image_small, image_large, raw_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [
      card.id,
      card.number ?? null,
      card.name,
      card.set?.id ?? null,
      card.set?.name ?? null,
      card.images?.small ?? null,
      card.images?.large ?? null,
      JSON.stringify(card),
    ] as SqlParam[],
  );
}

async function syncCards(): Promise<void> {
  let page = 1;
  let totalInserted = 0;

  while (true) {
    console.log(`Fetching cards page ${page}`);

    const cards = await getCardsPage(page);

    for (const card of cards) {
      await insertCard(card);
      totalInserted++;
    }

    console.log(`Inserted ${totalInserted} cards so far`);

    if (cards.length < PAGE_SIZE) break;

    page++;
    await waitBetweenRequests();
  }

  console.log("Done syncing cards");
}

syncCards().catch((err: unknown) => {
  logError("Card sync failed", err);
});
