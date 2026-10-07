import type { PokeTraceCardSort } from "../../utils/sortPokeTraceCards";
import { CloseButton } from "../closeButton/CloseButton";
import { PokeTraceSortDropdown } from "../pokeTraceSortDropdown/PokeTraceSortDropdown";
import "./SearchResultsToolbar.scss";

type SearchResultsToolbarProps = {
  activeQueryLabel: string;
  includeChangeSort?: boolean;
  onClose: () => void;
  onSortChange: (value: PokeTraceCardSort) => void;
  resultCount: number;
  sortDirection: PokeTraceCardSort;
};

export function SearchResultsToolbar({
  activeQueryLabel,
  includeChangeSort = true,
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
          <PokeTraceSortDropdown
            ariaLabel="Sort search results"
            className="search-results-sort-control__dropdown"
            includeChange={includeChangeSort}
            value={sortDirection}
            onChange={onSortChange}
          />
        </label>
        <CloseButton ariaLabel="Close search results" onClick={onClose} />
      </div>
    </div>
  );
}
