const MAX_QUANTITY = 1_000_000;
const PRICE_SOURCE_PATTERN =
  /^(tcgplayer|cardmarket):[A-Za-z0-9._-]{1,80}$/;
const PORTFOLIO_ENTRY_FIELDS = new Set(["quantity", "priceSource"]);
const KNOWN_LEGACY_CARD_FIELDS = new Set([
  "abilities",
  "ancientTrait",
  "artist",
  "attacks",
  "cardmarket",
  "convertedRetreatCost",
  "evolvesFrom",
  "evolvesTo",
  "flavorText",
  "grok",
  "hp",
  "id",
  "images",
  "legalities",
  "level",
  "name",
  "nationalPokedexNumbers",
  "number",
  "rarity",
  "regulationMark",
  "resistances",
  "retreatCost",
  "rules",
  "set",
  "subtypes",
  "supertype",
  "tcgplayer",
  "types",
  "vstarPower",
  "weaknesses",
]);

export type SlimPortfolioDocument = {
  quantity: number;
  priceSource?: string;
};

function readQuantity(value: unknown): number {
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) &&
    quantity >= 1 &&
    quantity <= MAX_QUANTITY
    ? quantity
    : 1;
}

function readPriceSource(value: unknown): string | undefined {
  const priceSource = typeof value === "string" ? value.trim() : "";
  return PRICE_SOURCE_PATTERN.test(priceSource) ? priceSource : undefined;
}

export function compactPortfolioDocument(
  data: Record<string, unknown>,
): SlimPortfolioDocument {
  const priceSource = readPriceSource(data.priceSource);
  return {
    quantity: readQuantity(data.quantity),
    ...(priceSource && { priceSource }),
  };
}

export function isPortfolioDocumentCompact(
  data: Record<string, unknown>,
  compact: SlimPortfolioDocument,
): boolean {
  const keys = Object.keys(data).sort();
  const compactKeys = Object.keys(compact).sort();
  return (
    keys.length === compactKeys.length &&
    keys.every((key, index) => key === compactKeys[index]) &&
    data.quantity === compact.quantity &&
    data.priceSource === compact.priceSource
  );
}

export function getPortfolioExtraFields(
  data: Record<string, unknown>,
): string[] {
  return Object.keys(data).filter((key) => !PORTFOLIO_ENTRY_FIELDS.has(key));
}

export function isKnownLegacyPortfolioCardField(field: string): boolean {
  return KNOWN_LEGACY_CARD_FIELDS.has(field);
}

export function getProtectedPortfolioFields(
  data: Record<string, unknown>,
): string[] {
  return getPortfolioExtraFields(data).filter(
    (key) => !KNOWN_LEGACY_CARD_FIELDS.has(key),
  );
}
