export function normalizeFilterText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getFilterKeywords(query: string) {
  return query
    .split(",")
    .map(normalizeFilterText)
    .filter((keyword) => keyword.length >= 2);
}
