import { X } from "lucide-react";
import {
  POKETRACE_SEARCH_SORTS,
  type PokeTraceSearchSort,
} from "../../../shared/pokeTraceSearch";
import { SelectDropdown } from "../selectDropdown/SelectDropdown";
import "./SearchResultsToolbar.scss";

const SEARCH_SORT_LABELS: Record<PokeTraceSearchSort, string> = {
  "price-high-low": "Price: high to low",
  "price-low-high": "Price: low to high",
};

const SEARCH_SORT_OPTIONS = POKETRACE_SEARCH_SORTS.map((value) => ({
  value,
  label: SEARCH_SORT_LABELS[value],
}));

type SearchResultsToolbarProps = {
  activeQueryLabel: string;
  onClose: () => void;
  onSortChange: (value: PokeTraceSearchSort) => void;
  resultCount: number;
  sortDirection: PokeTraceSearchSort;
};

export function SearchResultsToolbar({
  activeQueryLabel,
  onClose,
  onSortChange,
  resultCount,
  sortDirection,
}: SearchResultsToolbarProps) {
  return (
    <div className="search-results-toolbar">
      <div className="search-results-toolbar__copy">
        <p className="search-results-toolbar__meta">
          {resultCount} card{resultCount === 1 ? "" : "s"} matching
          {activeQueryLabel ? <> &ldquo;{activeQueryLabel}&rdquo;</> : null}
        </p>
      </div>
      <div className="search-results-toolbar__actions">
        <label className="search-results-sort-control">
          <SelectDropdown
            ariaLabel="Sort search results"
            className="search-results-sort-control__dropdown"
            options={SEARCH_SORT_OPTIONS}
            value={sortDirection}
            onChange={onSortChange}
          />
        </label>
        <button
          aria-label="Close search results"
          className="search-results-toolbar__close"
          onClick={onClose}
          title="Close results"
          type="button"
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
