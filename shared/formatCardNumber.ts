type CardNumberSource = {
  number?: string;
  set?: {
    printedTotal?: number;
  };
};

/**
 * Collector-style number: zero-padded over set size, e.g. 4 + 53 -> "004/053".
 * Leaves non-numeric card-number formats unchanged.
 */
function formatCollectorNumber(
  card: CardNumberSource,
  cardNumber: string | undefined,
  padNumber: boolean,
): string | undefined {
  const number = cardNumber ?? card.number;
  if (!number) return undefined;

  const fraction = number.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    if (!padNumber) return number;

    const [, numerator, denominator] = fraction;
    return `${numerator.padStart(denominator.length, "0")}/${denominator}`;
  }

  if (
    number.includes("/") ||
    !/^\d+$/.test(number) ||
    card.set?.printedTotal == null
  ) {
    return number;
  }

  const total = String(card.set.printedTotal);
  const formattedNumber = padNumber
    ? number.padStart(total.length, "0")
    : number;

  return `${formattedNumber}/${total}`;
}

export function formatCardNumber(
  card: CardNumberSource,
  cardNumber?: string,
): string | undefined {
  return formatCollectorNumber(card, cardNumber, true);
}

export function formatUnpaddedCardNumber(
  card: CardNumberSource,
  cardNumber?: string,
): string | undefined {
  return formatCollectorNumber(card, cardNumber, false);
}
