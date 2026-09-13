export function isScoreNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 100
  );
}

export function parseScoreString(value: unknown): number | null {
  return typeof value === "string" && /^(?:[1-9]|[1-9]\d|100)$/.test(value)
    ? Number(value)
    : null;
}
