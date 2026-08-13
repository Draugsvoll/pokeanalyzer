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

function normalizeCardNumberPart(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^0+(?=\d)/, "")
    .toLowerCase();
}

function normalizeMatchText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMatchTokens(value: unknown) {
  const normalized = normalizeMatchText(value);
  return normalized ? normalized.split(" ") : [];
}

function getRarityTokens(value: unknown) {
  return getMatchTokens(value).map((token) => {
    if (token === "holofoil" || token === "holographic") return "holo";
    return token;
  });
}

function getCommonTokenRatio(first: string[], second: string[]) {
  const firstSet = new Set(first);
  const secondSet = new Set(second);
  const smallerSet = firstSet.size <= secondSet.size ? firstSet : secondSet;
  const largerSet = firstSet.size > secondSet.size ? firstSet : secondSet;
  let common = 0;

  for (const token of smallerSet) {
    if (largerSet.has(token)) common += 1;
  }

  return smallerSet.size > 0 ? common / smallerSet.size : 0;
}

function canonicalizeSetName(value: unknown) {
  const normalized = normalizeMatchText(value)
    .replace(/\bpokemon\b/g, "")
    .replace(/\btcg\b/g, "")
    .replace(/\bcard\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const aliases: Record<string, string> = {
    "black star promo": "black star promos",
    "black star promos": "black star promos",
    "nintendo black star promo": "black star promos",
    "nintendo black star promos": "black star promos",
  };

  return aliases[normalized] ?? normalized;
}

function setNamesMatch(first: unknown, second: unknown) {
  const normalizedFirst = canonicalizeSetName(first);
  const normalizedSecond = canonicalizeSetName(second);

  return (
    normalizedFirst.length > 0 &&
    normalizedSecond.length > 0 &&
    (normalizedFirst.includes(normalizedSecond) ||
      normalizedSecond.includes(normalizedFirst))
  );
}

function setNamesMatchStrictly(first: unknown, second: unknown) {
  const normalizedFirst = canonicalizeSetName(first);
  const normalizedSecond = canonicalizeSetName(second);

  return (
    normalizedFirst.length > 0 &&
    normalizedSecond.length > 0 &&
    normalizedFirst === normalizedSecond
  );
}

function rarityMatches(first: unknown, second: unknown) {
  const firstTokens = new Set(getRarityTokens(first));
  const secondTokens = getRarityTokens(second);
  if (secondTokens.length === 0) return true;
  if (firstTokens.size === 0) return false;
  if (firstTokens.size !== new Set(secondTokens).size) return false;

  return secondTokens.every((token) => firstTokens.has(token));
}

function cardNamesMatch(first: unknown, second: unknown) {
  const normalizedFirst = normalizeMatchText(first);
  const normalizedSecond = normalizeMatchText(second);
  if (!normalizedFirst || !normalizedSecond) return false;
  if (
    normalizedFirst.includes(normalizedSecond) ||
    normalizedSecond.includes(normalizedFirst)
  ) {
    return true;
  }

  return (
    getCommonTokenRatio(
      getMatchTokens(normalizedFirst),
      getMatchTokens(normalizedSecond),
    ) >= 0.75
  );
}

function parseJustTcgPrintedNumber(justTcgNumber?: string) {
  if (!justTcgNumber?.trim()) return null;
  const [cardNumber, printedTotal] = justTcgNumber
    .split("/")
    .map((part) => normalizeCardNumberPart(part));

  if (!cardNumber || !printedTotal) return null;

  return { cardNumber, printedTotal };
}

export function findUniqueJustTcgMoverCardRow(
  rows: { raw_json: string }[],
  priceMovement: JustTcgPriceMovement,
): { raw_json: string } | null {
  const parsedNumber = parseJustTcgPrintedNumber(
    priceMovement.just_tcg_number,
  );
  if (!parsedNumber) return null;

  const firstLayerMatches = rows
    .map((row) => ({
      card: parsePublicStoredCard(String(row.raw_json)),
      row,
    }))
    .filter(({ card }) => {
      const cardNumber = normalizeCardNumberPart(card.number);
      const printedTotal = normalizeCardNumberPart(card.set?.printedTotal);

      return (
        cardNumber === parsedNumber.cardNumber &&
        printedTotal === parsedNumber.printedTotal &&
        cardNamesMatch(card.name, priceMovement.cardName) &&
        setNamesMatch(card.set?.name, priceMovement.setName)
      );
    });

  const rarityMatchesOnly = firstLayerMatches.filter(({ card }) =>
    rarityMatches(card.rarity, priceMovement.rarity),
  );

  if (rarityMatchesOnly.length === 1) {
    return rarityMatchesOnly[0].row;
  }

  const strictSetMatches = rarityMatchesOnly.filter(({ card }) =>
    setNamesMatchStrictly(card.set?.name, priceMovement.setName),
  );

  return strictSetMatches.length === 1 ? strictSetMatches[0].row : null;
}

export async function hydrateJustTcgPriceMovements(
  priceMovements: JustTcgPriceMovement[],
): Promise<JustTcgMovementResult[]> {
  const cards = await Promise.all(
    priceMovements.map(async (priceMovement) => {
      const parsedNumber = parseJustTcgPrintedNumber(
        priceMovement.just_tcg_number,
      );
      const rows = await dbAll<{ raw_json: string }>(
        `
          SELECT raw_json
          FROM cards
          WHERE lower(trim(number)) = ?
             OR ltrim(lower(trim(number)), '0') = ?
        `,
        [parsedNumber?.cardNumber ?? "", parsedNumber?.cardNumber ?? ""],
      );
      const matchedRow = findUniqueJustTcgMoverCardRow(
        rows,
        priceMovement,
      );

      if (!matchedRow) return null;

      const card = parsePublicStoredCard(String(matchedRow.raw_json));

      return {
        card: formatJustTcgCardData(card, priceMovement),
        mover: priceMovement,
      };
    }),
  );

  return cards.filter((card): card is JustTcgMovementResult => card !== null);
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
