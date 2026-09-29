export const PRICE_CHANGE_PERIODS = ["1d", "7d", "30d"] as const;

export type PriceChangePeriod = (typeof PRICE_CHANGE_PERIODS)[number];

export function formatPriceChangePeriodLabel(period: PriceChangePeriod) {
  return period;
}

export function formatPriceChangePeriodLong(period: PriceChangePeriod) {
  const days = Number.parseInt(period, 10);
  return `${days}-day`;
}
