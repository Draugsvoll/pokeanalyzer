export function implicitLocalDatabaseError(
  databaseUrl: string | undefined,
): string | null {
  if (databaseUrl?.trim()) return null;
  return (
    "TURSO_DATABASE_URL is missing. Set TURSO_DATABASE_URL before running database operations."
  );
}
