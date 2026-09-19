export function findMissingColumns(
  actualColumns: Iterable<string>,
  requiredColumns: readonly string[],
): string[] {
  const actual = new Set(actualColumns);
  return requiredColumns.filter((column) => !actual.has(column));
}
