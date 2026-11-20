import type { ReactNode } from "react";
import { CloseButton } from "../closeButton/CloseButton";
import "./SearchResultsToolbar.scss";

type SearchResultsToolbarProps = {
  activeQueryLabel: string;
  itemLabel: {
    plural: string;
    singular: string;
  };
  onClose: () => void;
  resultCount: number;
  sortControl?: ReactNode;
  filterControl?: ReactNode;
};

function capitalizeSearchTerms(label: string) {
  return label
    .split(" · ")
    .map((term) =>
      term.length === 0 ? term : `${term.charAt(0).toUpperCase()}${term.slice(1)}`,
    )
    .join(" · ");
}

export function SearchResultsToolbar({
  activeQueryLabel,
  itemLabel,
  onClose,
  resultCount,
  sortControl,
  filterControl,
}: SearchResultsToolbarProps) {
  const queryLabel = activeQueryLabel
    ? capitalizeSearchTerms(activeQueryLabel)
    : "";

  return (
    <div className="search-results-toolbar">
      <div className="search-results-toolbar__copy">
        <p className="search-results-toolbar__meta" role="status">
          {resultCount}{" "}
          {resultCount === 1 ? itemLabel.singular : itemLabel.plural} matching
          {queryLabel ? <> &ldquo;{queryLabel}&rdquo;</> : null}
        </p>
      </div>
      <div className="search-results-toolbar__actions">
        {filterControl}
        {resultCount > 0 && sortControl && (
          <div className="search-results-sort-control">{sortControl}</div>
        )}
        <CloseButton ariaLabel="Close search results" onClick={onClose} />
      </div>
    </div>
  );
}
