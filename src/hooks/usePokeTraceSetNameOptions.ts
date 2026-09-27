import { useEffect, useState } from "react";
import type { AutosuggestOption } from "../components/autosuggestCombobox/AutosuggestCombobox";
import { FALLBACK_POKETRACE_SET_NAMES } from "../data/pokeTraceSetNames";
import { loadPokeTraceCatalogSetNames } from "../services/pokeTraceCatalog";

const FALLBACK_OPTIONS = FALLBACK_POKETRACE_SET_NAMES.map((setName) => ({
  label: setName,
  value: setName,
}));

export function usePokeTraceSetNameOptions() {
  const [options, setOptions] = useState<AutosuggestOption[]>(FALLBACK_OPTIONS);

  useEffect(() => {
    let active = true;
    void loadPokeTraceCatalogSetNames().then((setNames) => {
      if (!active || !setNames?.length) return;
      setOptions(
        setNames.map((setName) => ({ label: setName, value: setName })),
      );
    });
    return () => {
      active = false;
    };
  }, []);

  return options;
}
