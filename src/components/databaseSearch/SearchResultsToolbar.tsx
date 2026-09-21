import { X } from "lucide-react";
import { SelectDropdown } from "../selectDropdown/SelectDropdown";
import "./SearchResultsToolbar.scss";

export type SearchSortDirection = "price-high-low" | "price-low-high";

const SEARCH_SORT_OPTIONS: {
  value: SearchSortDirection;
  label: string;
}[] = [
  { value: "price-high-low", label: "Price: high to low" },
  { value: "price-low-high", label: "Price: low to high" },
];

type SearchResultsToolbarProps = {
  activeQueryLabel: string;
  onClose: () => void;
  onSortChange: (value: SearchSortDirection) => void;
  resultCount: number;
  sortDirection: SearchSortDirection;
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
