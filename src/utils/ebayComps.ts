const HIDDEN_EBAY_COMP_FIELDS = new Set([
  "itemid",
  "epid",
  "conditionid",
  "sellertype",
  "buyingformat",
  "bestofferaccepted",
  "categoryid",
  "shippingprice",
  "shippingcurrency",
  "shippingtype",
  "totalprice",
  "scrapedat",
  "fullresthumbnail",
  "fullresthumbnailurl",
]);

export type EbayCompsResponse = unknown;

export type EbayCompField = {
  key: string;
  value: string;
};

export type EbayCompResult = {
  thumbnailUrl: string | null;
  fields: EbayCompField[];
};

function getEbayCompsCards(data: EbayCompsResponse): unknown[] {
  if (Array.isArray(data)) return data;

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const arrayValue = Object.values(record).find(Array.isArray);

    if (arrayValue) return arrayValue;
  }

  return data ? [data] : [];
}

function formatEbayCompValue(value: unknown) {
  if (value == null) return "N/A";
  if (typeof value === "object") return JSON.stringify(value);

  return String(value);
}

export function getEbayCompsQuery(card: {
  name?: string;
  set?: { name?: string };
  number?: string;
}) {
  return [card.name, card.set?.name, card.number].filter(Boolean).join(" ");
}

export function getVisibleEbayCompResults(
  data: EbayCompsResponse,
  limit = 20
): EbayCompResult[] {
  return getEbayCompsCards(data)
    .slice(0, limit)
    .map((ebayComp) => {
      const result =
        ebayComp && typeof ebayComp === "object"
          ? (ebayComp as Record<string, unknown>)
          : { value: ebayComp };

      return {
        thumbnailUrl:
          typeof result.thumbnailUrl === "string" ? result.thumbnailUrl : null,
        fields: Object.entries(result)
          .filter(
            ([key]) =>
              key !== "thumbnailUrl" &&
              !HIDDEN_EBAY_COMP_FIELDS.has(key.toLowerCase())
          )
          .map(([key, value]) => ({
            key,
            value: formatEbayCompValue(value),
          })),
      };
    });
}
