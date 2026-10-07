import { POKETRACE_SEARCH_SORTS } from "../../../shared/pokeTraceSearch";
import type { PokeTraceCardSort } from "../../utils/sortPokeTraceCards";
import { SelectDropdown } from "../selectDropdown/SelectDropdown";

const SORT_LABELS: Record<PokeTraceCardSort, string> = {
  none: "Unsorted",
  "price-high-low": "Price: high–low",
  "price-low-high": "Price: low–high",
  "card-number-low-high": "Number: low–high",
  "card-number-high-low": "Number: high–low",
  "change-high-low": "% Change: high–low",
  "change-low-high": "% Change: low–high",
};

const POKETRACE_SORT_OPTIONS = [
  { value: "none" as const, label: SORT_LABELS.none },
  ...POKETRACE_SEARCH_SORTS.map((value) => ({
    value,
    label: SORT_LABELS[value],
  })),
];

type PokeTraceSortDropdownProps = {
  ariaLabel: string;
  className?: string;
  includeChange?: boolean;
  onChange: (value: PokeTraceCardSort) => void;
  value: PokeTraceCardSort;
};

export function PokeTraceSortDropdown({
  ariaLabel,
  className,
  includeChange = true,
  onChange,
  value,
}: PokeTraceSortDropdownProps) {
  return (
    <SelectDropdown
      ariaLabel={ariaLabel}
      className={className}
      onChange={onChange}
      options={
        includeChange
          ? POKETRACE_SORT_OPTIONS
          : POKETRACE_SORT_OPTIONS.filter(
              ({ value }) => !value.startsWith("change-"),
            )
      }
      value={value}
    />
  );
}
