import type {
  JustTcgMovementPeriod,
  JustTcgMovementResult,
} from "../../src/types/justTcgMovers.js";
import type { PokemonCard } from "../../src/types/pokemon/card.js";
import { dbAll } from "../db/db.js";
import { parsePublicStoredCard } from "../db/cardSerialization.js";
import type { JustTcgPriceMovement } from "./justTcgApi.js";

function formatJustTcgPriceKey(priceMovement: JustTcgPriceMovement) {
  return [priceMovement.printing, priceMovement.condition]
    .join(":")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatJustTcgPriceData(priceMovement: JustTcgPriceMovement) {
  const percentChangeKey = `percentChange${priceMovement.period}` as const;
  const absoluteChangeKey = `absoluteChange${priceMovement.period}` as const;

  return {
    [absoluteChangeKey]: priceMovement.absoluteChange,
    condition: priceMovement.condition,
    market: priceMovement.currentPrice,
    [percentChangeKey]: priceMovement.changePercent,
    printing: priceMovement.printing,
    setName: priceMovement.setName,
  };
}

function formatJustTcgCardData(
  card: Record<string, unknown>,
  priceMovement: JustTcgPriceMovement,
): PokemonCard {
  const key = formatJustTcgPriceKey(priceMovement) || "justtcg";

  return {
    ...card,
    justtcg: {
      prices: {
        [key]: formatJustTcgPriceData(priceMovement),
      },
    },
  } as PokemonCard;
}

function findUniqueJustTcgMoverCard(rows: { raw_json: string }[]) {
  return rows.length === 1 ? rows[0] : null;
}

export async function hydrateJustTcgPriceMovements(
  priceMovements: JustTcgPriceMovement[],
): Promise<JustTcgMovementResult[]> {
  const cards: Array<JustTcgMovementResult | null> = await Promise.all(
    priceMovements.map(async (priceMovement) => {
      const rows = await dbAll<{ raw_json: string }>(
        `
          SELECT raw_json
          FROM cards
          WHERE name = ?
            AND (? IS NULL OR set_name = ?)
          LIMIT 2
        `,
        [
          priceMovement.cardName,
          priceMovement.setName ?? null,
          priceMovement.setName ?? null,
        ],
      );
      const matchedRow = findUniqueJustTcgMoverCard(rows);
      const card = matchedRow
        ? parsePublicStoredCard(String(matchedRow.raw_json))
        : null;

      return card
        ? {
            card: formatJustTcgCardData(card, priceMovement),
            mover: priceMovement,
          }
        : null;
    }),
  );

  return cards.filter((item): item is JustTcgMovementResult => item !== null);
}

export async function fetchHydratedJustTcgMovers(
  fetchMovers: (
    signal?: AbortSignal,
    period?: JustTcgMovementPeriod,
  ) => Promise<JustTcgPriceMovement[]>,
  period: JustTcgMovementPeriod,
  signal?: AbortSignal,
): Promise<JustTcgMovementResult[]> {
  const priceMovements = await fetchMovers(signal, period);
  return hydrateJustTcgPriceMovements(priceMovements);
}
