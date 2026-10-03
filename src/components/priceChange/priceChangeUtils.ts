export type PriceChangeTone = "down" | "flat" | "up";

export function priceChangeTone(value: number): PriceChangeTone {
  if (Math.abs(value) < 0.005) return "flat";
  return value > 0 ? "up" : "down";
}

export function formatAbsolutePriceChangePercent(value: number) {
  if (Math.abs(value) < 0.005) return "0%";
  return `${Math.abs(value).toFixed(1)}%`;
}

export function priceChangeDirectionLabel(tone: PriceChangeTone) {
  if (tone === "up") return "Price increased";
  if (tone === "down") return "Price decreased";
  return "Price unchanged";
}

export function formatPriceChangeAccessibleLabel(
  percent: number,
  title: string,
) {
  const tone = priceChangeTone(percent);
  return `${priceChangeDirectionLabel(tone)} by ${formatAbsolutePriceChangePercent(percent)}. ${title}`;
}
