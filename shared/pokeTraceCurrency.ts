export const POKETRACE_CURRENCY = "USD";

const pokeTraceMoneyFormatter = new Intl.NumberFormat("en-US", {
  currency: POKETRACE_CURRENCY,
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "currency",
});

export function formatPokeTraceMoney(value: number) {
  return pokeTraceMoneyFormatter.format(value);
}
