import { pkmnPricesDb, pkmnPricesReady } from "../db/pkmnPricesDb.js";

type PkmnCard = Record<string, unknown> & {
  id: number;
  name: string;
  set: { name?: string };
  prices: unknown[];
};

function isCard(value: unknown, id: number): value is PkmnCard {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const card = value as Record<string, unknown>;
  return (
    card.id === id &&
    typeof card.name === "string" &&
    Boolean(card.set) &&
    typeof card.set === "object" &&
    !Array.isArray(card.set) &&
    Array.isArray(card.prices)
  );
}

const stringOrNull = (value: unknown) =>
  typeof value === "string" ? value : null;

export async function importPkmnPricesCard(id: number, apiKey: string) {
  const response = await fetch(`https://api.pkmnprices.com/v1/cards/${id}`, {
    headers: { "X-API-Key": apiKey },
  });
  if (!response.ok) {
    throw new Error(`PkmnPrices card ${id} returned HTTP ${response.status}`);
  }

  const value: unknown = await response.json();
  if (!isCard(value, id)) {
    throw new Error(`PkmnPrices card ${id} returned invalid data`);
  }

  await pkmnPricesReady;
  await pkmnPricesDb.execute({
    sql: `
      INSERT INTO pkmn_cards
        (id, name, number, set_name, rarity, image_url, raw_json, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        number = excluded.number,
        set_name = excluded.set_name,
        rarity = excluded.rarity,
        image_url = excluded.image_url,
        raw_json = excluded.raw_json,
        fetched_at = strftime('%Y-%m-%d %H:%M:%f', 'now')
    `,
    args: [
      id,
      value.name,
      stringOrNull(value.number),
      stringOrNull(value.set.name),
      stringOrNull(value.rarity),
      stringOrNull(value.image_url),
      JSON.stringify(value),
    ],
  });

  return value.name;
}
