import {
  isRecord,
  isTcgOffer,
  isTcgSale,
  matchesTcgFilters,
  TCG_CONDITIONS,
  type TcgSnapshot,
  type TcgSale,
  type TcgOffer,
} from "../../shared/tcgExplorer.js";

export type TcgSearchContext = Pick<
  TcgSnapshot,
  "productId" | "printing" | "condition" | "language"
>;
export function getTcgApiConfig() {
  const key = process.env.COMPSNIPER_API_KEY;
  if (!key) throw new Error("COMPSNIPER_API_KEY is not configured");
  return {
    key,
    salesUrl:
      process.env.COMPSNIPER_TCG_SALES_API_URL ||
      "https://api.compsniper.com/v1/tcgplayer/sold",
    listingsUrl:
      process.env.COMPSNIPER_TCG_LISTINGS_API_URL ||
      "https://api.compsniper.com/v1/tcgplayer/listings",
  };
}
type ApiConfig = ReturnType<typeof getTcgApiConfig>;
function searchUrl(endpoint: string, context: TcgSearchContext, count: number) {
  const url = new URL(endpoint);
  url.searchParams.set("productId", String(context.productId));
  url.searchParams.delete("variant");
  url.searchParams.set("language", context.language);
  url.searchParams.set("count", String(count));
  url.searchParams.delete("keyword");
  if (context.condition === "all") url.searchParams.delete("condition");
  else
    url.searchParams.set(
      "condition",
      TCG_CONDITIONS.find((item) => item.value === context.condition)!.name,
    );
  return url;
}
async function request(
  url: URL,
  signal: AbortSignal,
  config: ApiConfig,
  productId: number,
) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.key}` },
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`TCG request failed (${response.status})`);
  }
  const data: unknown = await response.json();
  if (
    !isRecord(data) ||
    !isRecord(data.product) ||
    data.product.productId !== productId ||
    !Array.isArray(data.items)
  )
    throw new Error("Invalid TCG product response");
  return data.items as unknown[];
}
// Accept documented numeric prices and decimal strings without treating missing values as zero.
function number(value: unknown) {
  return typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)
    ? Number(value)
    : value;
}
function common(row: Record<string, unknown>) {
  return {
    price: number(row.price),
    shippingPrice: number(row.shipping),
    condition: row.condition ?? null,
    language: row.language ?? null,
    quantity: row.quantity ?? null,
  };
}
export async function fetchTcgSales(
  context: TcgSearchContext,
  signal: AbortSignal,
  config: ApiConfig,
): Promise<TcgSale[]> {
  const url = searchUrl(config.salesUrl, context, 250);
  url.searchParams.set("history", "none");
  const items = await request(url, signal, config, context.productId);
  return items
    .map((row) => {
      if (!isRecord(row)) throw new Error("Invalid TCG sale");
      const sale = {
        ...common(row),
        variant: row.variant ?? null,
        soldDate: row.soldAt ?? null,
      };
      if (!isTcgSale(sale)) throw new Error("Invalid TCG sale");
      return sale;
    })
    .filter((sale) => matchesTcgFilters(sale, sale.variant, context));
}
export async function fetchTcgOffers(
  context: TcgSearchContext,
  signal: AbortSignal,
  config: ApiConfig,
): Promise<{ offers: TcgOffer[]; offersMatched: boolean }> {
  const url = searchUrl(config.listingsUrl, context, 50);
  url.searchParams.set("page", "1");
  const items = await request(url, signal, config, context.productId);
  const offers = items
    .map((row) => {
      if (!isRecord(row)) throw new Error("Invalid TCG listing");
      const offer = {
        ...common(row),
        printing: row.variant ?? null,
        sellerName: row.sellerName ?? null,
        sellerRating: number(row.sellerRating) ?? null,
        verifiedSeller: row.verifiedSeller ?? null,
        directSeller: row.directSeller ?? null,
        goldSeller: row.goldSeller ?? null,
        sellerSales: row.sellerSales ?? null,
        sellerLocation: row.sellerLocation ?? null,
      };
      if (!isTcgOffer(offer)) throw new Error("Invalid TCG listing");
      return offer;
    })
    .filter((offer) => matchesTcgFilters(offer, offer.printing, context));
  return { offers, offersMatched: true };
}
