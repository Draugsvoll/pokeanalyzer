import { normalizePokeTraceSetSummary } from "./pokeTraceSetSummaryValidation.js";
import type { PokeTraceCatalogResponse } from "./pokeTraceCatalog.js";
import {
  createPokeTraceSetSummaries,
  type PokeTraceSetSummary,
} from "./pokeTraceSetSummaries.js";

const LEGACY_POKETRACE_FILTER_OPTIONS_SCHEMA_VERSION = 1;
export const POKETRACE_FILTER_OPTIONS_SCHEMA_VERSION = 2;

export type PokeTraceFilterOptions = {
  schemaVersion: typeof POKETRACE_FILTER_OPTIONS_SCHEMA_VERSION;
  generatedAt: string;
  rarities: string[];
  setNames: string[];
  setSummaries: PokeTraceSetSummary[];
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

function normalizedSetSummaries(values: unknown) {
  if (!Array.isArray(values)) return null;

  const summaries = new Map<string, PokeTraceSetSummary>();
  for (const value of values) {
    const normalized = normalizePokeTraceSetSummary(value);
    if (!normalized) return null;
    const key = normalized.setName.toLocaleLowerCase("en-US");
    if (summaries.has(key)) return null;
    summaries.set(key, normalized);
  }

  return [...summaries.values()].sort((left, right) =>
    left.setName.localeCompare(right.setName, "en-US", {
      sensitivity: "base",
    }),
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
  const legacyPayload =
    candidate.schemaVersion === LEGACY_POKETRACE_FILTER_OPTIONS_SCHEMA_VERSION;
  const setSummaries = legacyPayload
    ? []
    : normalizedSetSummaries(candidate.setSummaries);
  if (
    (!legacyPayload &&
      candidate.schemaVersion !== POKETRACE_FILTER_OPTIONS_SCHEMA_VERSION) ||
    typeof candidate.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.generatedAt)) ||
    !rarities ||
    !setNames ||
    !setSummaries
  ) {
    throw new Error("Invalid PokeTrace filter options");
  }

  const setNameKeys = new Set(
    setNames.map((setName) => setName.toLocaleLowerCase("en-US")),
  );
  if (
    setSummaries.some(
      ({ setName }) => !setNameKeys.has(setName.toLocaleLowerCase("en-US")),
    )
  ) {
    throw new Error("Invalid PokeTrace filter options");
  }

  return {
    schemaVersion: POKETRACE_FILTER_OPTIONS_SCHEMA_VERSION,
    generatedAt: candidate.generatedAt,
    rarities,
    setNames,
    setSummaries,
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
    setSummaries: createPokeTraceSetSummaries(
      catalog.cards,
      catalog.generatedAt,
    ),
  });
}
