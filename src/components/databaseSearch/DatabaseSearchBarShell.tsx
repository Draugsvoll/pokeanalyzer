import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEventHandler,
  type ReactNode,
  type RefObject,
} from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";

export type PriceFilterValidation = {
  field: "max" | "min";
  message: string;
};

type DatabaseSearchPriceFieldsProps = {
  maxPrice: string;
  minPrice: string;
  onKeyDown: KeyboardEventHandler<HTMLInputElement>;
  onMaxPriceChange: (value: string) => void;
  onMinPriceChange: (value: string) => void;
  validation: PriceFilterValidation | null;
};

export function DatabaseSearchPriceFields({
  maxPrice,
  minPrice,
  onKeyDown,
  onMaxPriceChange,
  onMinPriceChange,
  validation,
}: DatabaseSearchPriceFieldsProps) {
  const validationId = useId();

  const renderPriceField = (
    field: PriceFilterValidation["field"],
    label: string,
    placeholder: string,
    value: string,
    onChange: (value: string) => void,
  ) => {
    const invalid = validation?.field === field;

    return (
      <label className="database-search-filter-field">
        <span
          className={`database-search-price-input${invalid ? " is-invalid" : ""}`}
        >
          <span aria-hidden="true">$</span>
          <input
            aria-describedby={invalid ? validationId : undefined}
            aria-invalid={invalid || undefined}
            aria-label={label}
            inputMode="decimal"
            min="0"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            step="0.01"
            type="number"
            value={value}
          />
        </span>
      </label>
    );
  };

  return (
    <>
      {renderPriceField(
        "min",
        "Minimum price",
        "Min",
        minPrice,
        onMinPriceChange,
      )}
      {renderPriceField(
        "max",
        "Maximum price",
        "Max",
        maxPrice,
        onMaxPriceChange,
      )}
      {validation && (
        <span className="database-search-visually-hidden" id={validationId}>
          {validation.message}
        </span>
      )}
    </>
  );
}

type DatabaseSearchBarShellProps = {
  autoFocusName: boolean;
  barClassName?: string;
  filterCount: number;
  filterGridClassName?: string;
  filterFields?: ReactNode;
  isSearching: boolean;
  onClearFilters: () => void;
  onSearch: () => void;
  renderFields: (nameInputRef: RefObject<HTMLInputElement | null>) => ReactNode;
  searchDisabled: boolean;
};

export function DatabaseSearchBarShell({
  autoFocusName,
  barClassName,
  filterCount,
  filterFields,
  filterGridClassName,
  isSearching,
  onClearFilters,
  onSearch,
  renderFields,
  searchDisabled,
}: DatabaseSearchBarShellProps) {
  const filterPanelId = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocusName) return;
    nameInputRef.current?.focus({ preventScroll: true });
  }, [autoFocusName]);

  return (
    <div className="database-search-control">
      <div
        className={`database-search-bar${barClassName ? ` ${barClassName}` : ""}`}
      >
        <div
          aria-label="Search fields"
          className="database-search-fields"
          role="group"
        >
          {renderFields(nameInputRef)}
        </div>

        <div className="database-search-actions">
          <div className="database-search-filter-entry">
            <button
              aria-controls={filterPanelId}
              aria-expanded={filtersOpen}
              aria-label={
                filterCount > 0
                  ? `Search filters, ${filterCount} active`
                  : "Search filters"
              }
              className={`database-search-filter-toggle${filtersOpen ? " is-open" : ""}`}
              onClick={() => setFiltersOpen((current) => !current)}
              type="button"
            >
              <span className="database-search-filter-toggle__icon">
                <SlidersHorizontal aria-hidden="true" />
                {filterCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="database-search-filter-toggle__count"
                  >
                    {filterCount}
                  </span>
                )}
              </span>
              <span>Filter</span>
            </button>
          </div>

          <button
            aria-busy={isSearching || undefined}
            className="explore-search-shell__submit"
            disabled={searchDisabled}
            onClick={onSearch}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            {isSearching ? (
              <span
                aria-label="Searching"
                className="database-search-spinner"
              />
            ) : (
              "Search"
            )}
          </button>
        </div>
      </div>

      {filtersOpen && (
        <div className="database-search-filter-toolbar">
          <div
            aria-label="Optional search filters"
            className="database-search-filters ui-render-fade"
            id={filterPanelId}
            role="group"
          >
            <div
              className={`database-search-filters__grid${filterGridClassName ? ` ${filterGridClassName}` : ""}`}
            >
              {filterFields}
            </div>
          </div>

          <div className="database-search-filter-actions">
            <button
              aria-label="Clear all"
              className="database-search-filters__clear"
              disabled={filterCount === 0}
              onClick={onClearFilters}
              type="button"
            >
              <RotateCcw aria-hidden="true" />
              <span>Clear all</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
