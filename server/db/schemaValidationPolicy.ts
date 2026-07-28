export const DAILY_SNAPSHOT_UNIQUE_KEY_SQL = `
  SELECT
    indexes.name AS index_name,
    columns_info.name AS column_name
  FROM pragma_index_list('price_snapshots') AS indexes
  INNER JOIN pragma_index_info(indexes.name) AS columns_info
  WHERE indexes."unique" = 1
  ORDER BY indexes.name, columns_info.seqno
`;

export function findMissingColumns(
  actualColumns: Iterable<string>,
  requiredColumns: readonly string[],
): string[] {
  const actual = new Set(actualColumns);
  return requiredColumns.filter((column) => !actual.has(column));
}
