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
};

export function SearchResultsToolbar({
  activeQueryLabel,
  itemLabel,
  onClose,
  resultCount,
  sortControl,
}: SearchResultsToolbarProps) {
  return (
    <div className="search-results-toolbar">
      <div className="search-results-toolbar__copy">
        <p className="search-results-toolbar__meta" role="status">
          {resultCount}{" "}
          {resultCount === 1 ? itemLabel.singular : itemLabel.plural} matching
          {activeQueryLabel ? <> &ldquo;{activeQueryLabel}&rdquo;</> : null}
        </p>
      </div>
      <div className="search-results-toolbar__actions">
        {resultCount > 0 && sortControl && (
          <div className="search-results-sort-control">{sortControl}</div>
        )}
        <CloseButton ariaLabel="Close search results" onClick={onClose} />
      </div>
    </div>
  );
}
