export function implicitLocalDatabaseError(
  databaseUrl: string | undefined,
  allowLocalDatabase: string | undefined,
): string | null {
  if (databaseUrl?.trim()) return null;
  if (allowLocalDatabase?.trim().toLowerCase() === "true") return null;
  return (
    "TURSO_DATABASE_URL is missing. Refusing to use the implicit local " +
    "database. Set TURSO_DATABASE_URL, or explicitly set " +
    "ALLOW_LOCAL_DATABASE=true for local development."
  );
}
