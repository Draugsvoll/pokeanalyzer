import { pokeTraceDb, pokeTraceReady } from "../db/pokeTraceDb.js";
import type { PokeTraceCard } from "./pokeTraceApi.js";

const textOrNull = (value: unknown) =>
  typeof value === "string" ? value : null;

export function cardUpsert(card: PokeTraceCard) {
  return {
    sql: `
      INSERT INTO poketrace_cards
        (id, name, card_number, set_name, rarity, variant, image_url,
         tcgplayer_id, raw_json, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        card_number = excluded.card_number,
        set_name = excluded.set_name,
        rarity = excluded.rarity,
        variant = excluded.variant,
        image_url = excluded.image_url,
        tcgplayer_id = excluded.tcgplayer_id,
        raw_json = excluded.raw_json,
        fetched_at = excluded.fetched_at
    `,
    args: [
      card.id,
      card.name,
      textOrNull(card.cardNumber),
      textOrNull(card.set?.name),
      textOrNull(card.rarity),
      textOrNull(card.variant),
      textOrNull(card.image),
      card.refs?.tcgplayerId == null ? null : String(card.refs.tcgplayerId),
      JSON.stringify(card),
    ],
  };
}

export async function savePokeTraceCards(cards: PokeTraceCard[]) {
  if (cards.length === 0) return;
  await pokeTraceReady;
  await pokeTraceDb.batch(cards.map(cardUpsert), "write");
}
