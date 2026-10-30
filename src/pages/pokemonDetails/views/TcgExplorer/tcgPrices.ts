import type { TcgSale, TcgOffer } from "../../../../../shared/tcgExplorer";

export function getTcgRowPrice(row: TcgSale | TcgOffer, shipping: boolean) {
  return row.price + (shipping ? row.shippingPrice : 0);
}
export function getTcgPriceSummary(
  rows: (TcgSale | TcgOffer)[],
  shipping: boolean,
) {
  const prices = rows
    .map((row) => getTcgRowPrice(row, shipping))
    .sort((a, b) => a - b);
  if (!prices.length) return null;
  const middle = Math.floor(prices.length / 2);
  return {
    high: prices[prices.length - 1],
    median:
      prices.length % 2
        ? prices[middle]
        : (prices[middle - 1] + prices[middle]) / 2,
    low: prices[0],
  };
}
