import type { PokemonCard } from "../types/pokemon";

/**
 * Collector-style number: zero-padded over set size, e.g. 4 + 53 → "004/053".
 * Leaves non-numeric or already-fraction numbers unchanged.
 */
export function formatCardNumber(
  card: Pick<PokemonCard, "number" | "set">,
  cardNumber?: string,
): string | undefined {
  const number = cardNumber ?? card.number;
  if (!number) return undefined;
  if (number.includes("/") || card.set?.printedTotal == null) return number;

  const total = String(card.set.printedTotal);
  const paddedNumber = /^\d+$/.test(number)
    ? number.padStart(total.length, "0")
    : number;

  return `${paddedNumber}/${total}`;
}
