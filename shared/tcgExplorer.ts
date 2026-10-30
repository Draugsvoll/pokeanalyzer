export const TCG_CONDITIONS = [
  { value: "all", label: "All conditions", name: "All conditions" },
  { value: "nearMint", label: "NM", name: "Near Mint" },
  { value: "lightlyPlayed", label: "LP", name: "Lightly Played" },
  { value: "moderatelyPlayed", label: "MP", name: "Moderately Played" },
  { value: "heavilyPlayed", label: "HP", name: "Heavily Played" },
  { value: "damaged", label: "Damaged", name: "Damaged" },
] as const;
export type TcgCondition = (typeof TCG_CONDITIONS)[number]["value"];
export const TCG_LANGUAGES = [
  "English",
  "Chinese (S)",
  "Chinese (T)",
  "French",
  "German",
  "Italian",
  "Japanese",
  "Korean",
  "Portuguese",
  "Russian",
  "Spanish",
] as const;
export type TcgLanguage = (typeof TCG_LANGUAGES)[number];

export type TcgSale = {
  price: number;
  shippingPrice: number;
  condition: string | null;
  variant: string | null;
  language: string | null;
  quantity: number | null;
  soldDate: string | null;
};
export type TcgOffer = Omit<TcgSale, "soldDate" | "variant"> & {
  printing: string | null;
  sellerName: string | null;
  sellerRating: number | null;
  verifiedSeller: boolean | null;
  directSeller: boolean | null;
  goldSeller?: boolean | null;
  sellerSales?: number | null;
  sellerLocation?: string | null;
};
export type TcgSnapshot = {
  productId: number;
  printing: string;
  condition: TcgCondition;
  language: TcgLanguage;
  fetchedAt: string;
  sales: TcgSale[] | null;
  offers: TcgOffer[] | null;
  offersMatched: boolean;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function isPriceRow(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    nonnegative(value.price) &&
    nonnegative(value.shippingPrice) &&
    nullableText(value.condition) &&
    nullableText(value.language) &&
    (value.quantity === null ||
      (nonnegative(value.quantity) && Number.isInteger(value.quantity)))
  );
}
export function isTcgSale(value: unknown): value is TcgSale {
  return (
    isPriceRow(value) &&
    nullableText(value.variant) &&
    nullableText(value.soldDate) &&
    (value.soldDate === null || Number.isFinite(Date.parse(value.soldDate)))
  );
}
export function isTcgOffer(value: unknown): value is TcgOffer {
  return (
    isPriceRow(value) &&
    (value.goldSeller == null || typeof value.goldSeller === "boolean") &&
    (value.sellerSales == null ||
      (nonnegative(value.sellerSales) &&
        Number.isInteger(value.sellerSales))) &&
    (value.sellerLocation === undefined ||
      nullableText(value.sellerLocation)) &&
    nullableText(value.printing) &&
    nullableText(value.sellerName) &&
    (value.sellerRating === null ||
      (nonnegative(value.sellerRating) && value.sellerRating <= 100)) &&
    (value.verifiedSeller === null ||
      typeof value.verifiedSeller === "boolean") &&
    (value.directSeller === null || typeof value.directSeller === "boolean")
  );
}
export function isTcgCondition(value: unknown): value is TcgCondition {
  return TCG_CONDITIONS.some((condition) => condition.value === value);
}
export function isTcgLanguage(value: unknown): value is TcgLanguage {
  return TCG_LANGUAGES.some((language) => language === value);
}
export function isTcgSnapshot(value: unknown): value is TcgSnapshot {
  return (
    isRecord(value) &&
    nonnegative(value.productId) &&
    Number.isSafeInteger(value.productId) &&
    value.productId > 0 &&
    typeof value.printing === "string" &&
    isTcgCondition(value.condition) &&
    isTcgLanguage(value.language) &&
    typeof value.fetchedAt === "string" &&
    Number.isFinite(Date.parse(value.fetchedAt)) &&
    (value.sales === null ||
      (Array.isArray(value.sales) && value.sales.every(isTcgSale))) &&
    (value.offers === null ||
      (Array.isArray(value.offers) && value.offers.every(isTcgOffer))) &&
    typeof value.offersMatched === "boolean"
  );
}
export function normalizeTcgLabel(value: string) {
  return value.replace(/_/g, " ").trim().replace(/\s+/g, " ").toLowerCase();
}
export function matchesTcgFilters(
  row: { condition: string | null; language: string | null },
  printing: string | null,
  filters: Pick<TcgSnapshot, "printing" | "condition" | "language">,
) {
  const condition = TCG_CONDITIONS.find(
    (item) => item.value === filters.condition,
  )!;
  return (
    (filters.printing === "all" ||
      (printing !== null &&
        normalizeTcgLabel(printing) === normalizeTcgLabel(filters.printing))) &&
    row.language !== null &&
    normalizeTcgLabel(row.language) === normalizeTcgLabel(filters.language) &&
    (filters.condition === "all" ||
      (row.condition !== null &&
        normalizeTcgLabel(row.condition) === normalizeTcgLabel(condition.name)))
  );
}
