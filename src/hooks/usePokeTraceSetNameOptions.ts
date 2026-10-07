import { useEffect, useState } from "react";
import type { AutosuggestOption } from "../components/autosuggestCombobox/AutosuggestCombobox";
import { FALLBACK_POKETRACE_SET_NAMES } from "../data/pokeTraceSetNames";
import { loadPokeTraceCatalogSetNames } from "../services/pokeTraceCatalog";
import { loadPokeTraceFilterOptions } from "../services/pokeTraceFilterOptions";
import { isPokeTraceSetSummaryFresh } from "../utils/pokeTraceSetSummaryFreshness";
import type { PokeTraceSetSummary } from "../../shared/pokeTraceSetSummaries";

export type PokeTraceSetNameOption = AutosuggestOption & {
  setSummary?: PokeTraceSetSummary;
};

const FALLBACK_OPTIONS = FALLBACK_POKETRACE_SET_NAMES.map((setName) => ({
  label: setName,
  value: setName,
}));

export function usePokeTraceSetNameOptions() {
  const [options, setOptions] =
    useState<PokeTraceSetNameOption[]>(FALLBACK_OPTIONS);

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadPokeTraceCatalogSetNames(),
      loadPokeTraceFilterOptions(),
    ]).then(([setNames, filterOptions]) => {
      if (!active || !setNames?.length) return;

      const now = Date.now();
      const freshSummaries = new Map(
        (filterOptions?.setSummaries ?? [])
          .filter(({ asOf }) => isPokeTraceSetSummaryFresh(asOf, now))
          .map((summary) => [
            summary.setName.toLocaleLowerCase("en-US"),
            summary,
          ]),
      );

      setOptions(
        setNames.map((setName) => {
          const setSummary = freshSummaries.get(
            setName.toLocaleLowerCase("en-US"),
          );
          return {
            label: setName,
            value: setName,
            ...(setSummary && { setSummary }),
          };
        }),
      );
    });
    return () => {
      active = false;
    };
  }, []);

  return options;
}
