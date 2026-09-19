export function normalizeCardVariant(value?: string | null): string {
  return (
    value?.trim().replaceAll("_", " ").replace(/\s+/g, " ").toLowerCase() ?? ""
  );
}
