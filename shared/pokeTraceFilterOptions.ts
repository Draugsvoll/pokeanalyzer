import type { PokeTraceCatalogResponse } from "./pokeTraceCatalog.js";

export const POKETRACE_FILTER_OPTIONS_SCHEMA_VERSION = 1;

export type PokeTraceFilterOptions = {
  schemaVersion: typeof POKETRACE_FILTER_OPTIONS_SCHEMA_VERSION;
  generatedAt: string;
  rarities: string[];
  setNames: string[];
};

function normalizedOptions(values: unknown) {
  if (!Array.isArray(values)) return null;

  const unique = new Map<string, string>();
  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) return null;
    const option = value.trim();
    unique.set(option.toLocaleLowerCase("en-US"), option);
  }

  return [...unique.values()].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
}

export function parsePokeTraceFilterOptions(
  value: unknown,
): PokeTraceFilterOptions {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid PokeTrace filter options");
  }

  const candidate = value as Record<string, unknown>;
  const rarities = normalizedOptions(candidate.rarities);
  const setNames = normalizedOptions(candidate.setNames);
  if (
    candidate.schemaVersion !== POKETRACE_FILTER_OPTIONS_SCHEMA_VERSION ||
    typeof candidate.generatedAt !== "string" ||
    !candidate.generatedAt.trim() ||
    !rarities ||
    !setNames
  ) {
    throw new Error("Invalid PokeTrace filter options");
  }

  return {
    schemaVersion: POKETRACE_FILTER_OPTIONS_SCHEMA_VERSION,
    generatedAt: candidate.generatedAt,
    rarities,
    setNames,
  };
}

export function createPokeTraceFilterOptions(
  catalog: PokeTraceCatalogResponse,
): PokeTraceFilterOptions {
  return parsePokeTraceFilterOptions({
    schemaVersion: POKETRACE_FILTER_OPTIONS_SCHEMA_VERSION,
    generatedAt: catalog.generatedAt,
    rarities: catalog.cards.flatMap((card) =>
      card.rarity ? [card.rarity] : [],
    ),
    setNames: catalog.cards.map((card) => card.setName),
  });
}
