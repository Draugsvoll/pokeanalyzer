import { useEffect, useState } from "react";
import type { AutosuggestOption } from "../components/autosuggestCombobox/AutosuggestCombobox";
import { FALLBACK_POKETRACE_SET_NAMES } from "../data/pokeTraceSetNames";
import { loadPokeTraceFilterOptions } from "../services/pokeTraceFilterOptions";
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
    let refreshing = false;
    async function refresh() {
      if (!active || refreshing) return;
      refreshing = true;
      try {
        const filterOptions = await loadPokeTraceFilterOptions();
        const setNames = filterOptions?.setNames;
        if (!active) return;

        const summaries = new Map(
          (filterOptions?.setSummaries ?? []).map((summary) => [
            summary.setName.toLocaleLowerCase("en-US"),
            summary,
          ]),
        );

        setOptions((current) =>
          (setNames?.length ? setNames : current.map(({ value }) => value)).map(
            (setName) => {
              const setSummary = summaries.get(
                setName.toLocaleLowerCase("en-US"),
              );
              return {
                label: setName,
                value: setName,
                ...(setSummary && { setSummary }),
              };
            },
          ),
        );
      } finally {
        refreshing = false;
      }
    }
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refresh();
    }

    void refresh();
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return options;
}
