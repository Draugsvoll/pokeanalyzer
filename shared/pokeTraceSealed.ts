import type { PriceChangePeriod } from "./priceChangePeriod.js";

export const POKETRACE_SEALED_CATALOG_SCHEMA_VERSION = 1;
export const POKETRACE_SEALED_SEARCH_RESULT_LIMIT = 2_000;

export type PokeTraceSealedCatalogProduct = {
  id: string;
  name: string;
  setName: string;
  productFamily: string;
  variant?: string;
  image?: string;
  currency: string;
  price: number | null;
  priceSnapshots: Record<PriceChangePeriod, number | null>;
  lastUpdated?: string;
};

export type PokeTraceSealedCatalogResponse = {
  schemaVersion: typeof POKETRACE_SEALED_CATALOG_SCHEMA_VERSION;
  generatedAt: string;
  products: PokeTraceSealedCatalogProduct[];
};

export type PokeTraceSealedSearch = {
  maxPrice?: number;
  minPrice?: number;
  name: string;
  productFamily: string;
  setName: string;
};

export type PokeTraceSealedSearchResponse = {
  items: PokeTraceSealedCatalogProduct[];
  total: number;
};

export type PokeTraceSealedFilterOptions = {
  productFamilies: string[];
  setNames: string[];
};

export type PokeTraceSealedMarketHistorySource = "ebay" | "tcgplayer";

export type PokeTraceSealedMarketHistoryPoint = {
  approxSaleCount: boolean | null;
  avg: number;
  date: string;
  high: number | null;
  low: number | null;
  median7d: number | null;
  median30d: number | null;
  saleCount: number | null;
};

export type PokeTraceSealedMarketHistory = {
  condition: "UNOPENED";
  currency: string;
  fetchedAt: string;
  period: "90d";
  productId: string;
  series: Partial<
    Record<
      PokeTraceSealedMarketHistorySource,
      PokeTraceSealedMarketHistoryPoint[]
    >
  >;
  stale: boolean;
};

export type PokeTraceSealedMarketplacePricing = {
  price: number | null;
  approxSaleCount: boolean | null;
  average1d: number | null;
  average7d: number | null;
  average30d: number | null;
  high: number | null;
  lastUpdated: string | null;
  low: number | null;
  median3d: number | null;
  median7d: number | null;
  median30d: number | null;
  saleCount: number | null;
};

export type PokeTraceSealedDetails = PokeTraceSealedCatalogProduct & {
  marketplaceUrls: Partial<Record<"cardmarket" | "ebay" | "tcgplayer", string>>;
  pricing: {
    ebay?: PokeTraceSealedMarketplacePricing;
    tcgplayer: PokeTraceSealedMarketplacePricing;
  };
  refs: {
    cardmarketId: string | null;
    tcgplayerId: string | null;
  };
  setSlug?: string;
};

function isNullablePrice(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value > 0)
  );
}

function isOptionalText(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return (
    value === null || (typeof value === "number" && Number.isFinite(value))
  );
}

function isPokeTraceSealedMarketplacePricing(
  value: unknown,
): value is PokeTraceSealedMarketplacePricing {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const pricing = value as Partial<PokeTraceSealedMarketplacePricing>;
  return (
    [
      pricing.price,
      pricing.average1d,
      pricing.average7d,
      pricing.average30d,
      pricing.high,
      pricing.low,
      pricing.median3d,
      pricing.median7d,
      pricing.median30d,
      pricing.saleCount,
    ].every(isNullableNumber) &&
    (pricing.approxSaleCount === null ||
      typeof pricing.approxSaleCount === "boolean") &&
    (pricing.lastUpdated === null || typeof pricing.lastUpdated === "string")
  );
}

function isPokeTraceSealedMarketHistoryPoint(
  value: unknown,
): value is PokeTraceSealedMarketHistoryPoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const point = value as Partial<PokeTraceSealedMarketHistoryPoint>;
  return Boolean(
    typeof point.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(point.date) &&
    typeof point.avg === "number" &&
    Number.isFinite(point.avg) &&
    isNullableNumber(point.high) &&
    isNullableNumber(point.low) &&
    isNullableNumber(point.median7d) &&
    isNullableNumber(point.median30d) &&
    isNullableNumber(point.saleCount) &&
    (point.approxSaleCount === null ||
      typeof point.approxSaleCount === "boolean"),
  );
}

export function isPokeTraceSealedMarketHistory(
  value: unknown,
): value is PokeTraceSealedMarketHistory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const history = value as Partial<PokeTraceSealedMarketHistory>;
  if (
    typeof history.productId !== "string" ||
    history.condition !== "UNOPENED" ||
    history.period !== "90d" ||
    typeof history.currency !== "string" ||
    !history.currency.trim() ||
    typeof history.fetchedAt !== "string" ||
    !Number.isFinite(Date.parse(history.fetchedAt)) ||
    typeof history.stale !== "boolean" ||
    !history.series ||
    typeof history.series !== "object" ||
    Array.isArray(history.series)
  ) {
    return false;
  }
  return (["ebay", "tcgplayer"] as const).every((source) => {
    const points = history.series?.[source];
    return (
      points === undefined ||
      (Array.isArray(points) &&
        points.every(isPokeTraceSealedMarketHistoryPoint))
    );
  });
}

export function isPokeTraceSealedCatalogProduct(
  value: unknown,
): value is PokeTraceSealedCatalogProduct {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const product = value as Partial<PokeTraceSealedCatalogProduct>;
  const snapshots = product.priceSnapshots;
  return Boolean(
    typeof product.id === "string" &&
    product.id.trim() &&
    typeof product.name === "string" &&
    product.name.trim() &&
    typeof product.setName === "string" &&
    product.setName.trim() &&
    typeof product.productFamily === "string" &&
    product.productFamily.trim() &&
    typeof product.currency === "string" &&
    product.currency.trim() &&
    isOptionalText(product.variant) &&
    isOptionalText(product.image) &&
    isOptionalText(product.lastUpdated) &&
    isNullablePrice(product.price) &&
    snapshots &&
    typeof snapshots === "object" &&
    !Array.isArray(snapshots) &&
    isNullablePrice(snapshots["1d"]) &&
    isNullablePrice(snapshots["7d"]) &&
    isNullablePrice(snapshots["30d"]),
  );
}

export function parsePokeTraceSealedCatalogResponse(
  value: unknown,
): PokeTraceSealedCatalogResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid sealed catalog response");
  }
  const response = value as Partial<PokeTraceSealedCatalogResponse>;
  if (
    response.schemaVersion !== POKETRACE_SEALED_CATALOG_SCHEMA_VERSION ||
    typeof response.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(response.generatedAt)) ||
    !Array.isArray(response.products) ||
    !response.products.every(isPokeTraceSealedCatalogProduct)
  ) {
    throw new Error("Invalid sealed catalog response");
  }
  return response as PokeTraceSealedCatalogResponse;
}

export function isPokeTraceSealedDetails(
  value: unknown,
): value is PokeTraceSealedDetails {
  if (!isPokeTraceSealedCatalogProduct(value)) return false;
  const details = value as Partial<PokeTraceSealedDetails>;
  if (
    !details.marketplaceUrls ||
    typeof details.marketplaceUrls !== "object" ||
    Array.isArray(details.marketplaceUrls) ||
    !details.pricing ||
    typeof details.pricing !== "object" ||
    Array.isArray(details.pricing) ||
    !details.refs ||
    typeof details.refs !== "object" ||
    Array.isArray(details.refs)
  ) {
    return false;
  }
  if (
    !["cardmarket", "ebay", "tcgplayer"].every((source) => {
      const url =
        details.marketplaceUrls?.[
          source as keyof PokeTraceSealedDetails["marketplaceUrls"]
        ];
      return url === undefined || typeof url === "string";
    }) ||
    !isPokeTraceSealedMarketplacePricing(details.pricing.tcgplayer) ||
    (details.pricing.ebay !== undefined &&
      !isPokeTraceSealedMarketplacePricing(details.pricing.ebay)) ||
    !Object.keys(details.pricing).every(
      (source) => source === "tcgplayer" || source === "ebay",
    ) ||
    (details.refs.cardmarketId !== null &&
      typeof details.refs.cardmarketId !== "string") ||
    (details.refs.tcgplayerId !== null &&
      typeof details.refs.tcgplayerId !== "string") ||
    !isOptionalText(details.setSlug)
  ) {
    return false;
  }
  return true;
}
