type GradedPrice = {
  avg1d?: unknown;
  avg7d?: unknown;
  avg30d?: unknown;
  median3d?: unknown;
  median30d?: unknown;
  median7d?: unknown;
  avg?: unknown;
  saleCount?: unknown;
};

export const MINIMUM_GRADED_PRICE_SALES = 15;

function sameWindow(first: unknown, second: unknown, third: unknown) {
  return (
    typeof first === "number" &&
    Number.isFinite(first) &&
    first === second &&
    second === third
  );
}

export function isEligibleGradedPrice(price: GradedPrice): boolean {
  if (
    typeof price.saleCount !== "number" ||
    !Number.isFinite(price.saleCount) ||
    price.saleCount < MINIMUM_GRADED_PRICE_SALES
  ) {
    return false;
  }
  return !(
    sameWindow(price.median3d, price.median7d, price.median30d) &&
    sameWindow(price.avg1d, price.avg7d, price.avg30d)
  );
}

export function resolveGradedPrice(price: GradedPrice): number | null {
  for (const value of [price.median30d, price.median7d, price.avg]) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return null;
}
