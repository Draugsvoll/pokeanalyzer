import { ChevronDown, Search as SearchIcon } from "lucide-react";
import { AutosuggestCombobox } from "../autosuggestCombobox/AutosuggestCombobox";
import { GridView } from "../gridView/GridView";
import { SealedProductView } from "../sealedProductView/SealedProductView";
import { SelectDropdown } from "../selectDropdown/SelectDropdown";
import {
  SEALED_SEARCH_PAGE_SIZE,
  type SealedDatabaseSearchController,
  type SealedProductSort,
} from "./useSealedDatabaseSearch";
import {
  DatabaseSearchBarShell,
  DatabaseSearchPriceFields,
} from "./DatabaseSearchBarShell";
import { SearchResultsToolbar } from "./SearchResultsToolbar";

const SEALED_SORT_OPTIONS: Array<{
  label: string;
  value: SealedProductSort;
}> = [
  { label: "Unsorted", value: "none" },
  { label: "Name: A–Z", value: "name-az" },
  { label: "Price: high–low", value: "price-high-low" },
  { label: "Price: low–high", value: "price-low-high" },
];

export function SealedDatabaseSearchBar({
  autoFocusName = false,
  search,
}: {
  autoFocusName?: boolean;
  search: SealedDatabaseSearchController;
}) {
  const filterCount =
    Number(Boolean(search.minPrice.trim())) +
    Number(Boolean(search.maxPrice.trim()));

  return (
    <DatabaseSearchBarShell
      autoFocusName={autoFocusName}
      barClassName="sealed-search-bar"
      filterCount={filterCount}
      filterFields={
        <DatabaseSearchPriceFields
          maxPrice={search.maxPrice}
          minPrice={search.minPrice}
          onKeyDown={search.onKeyDown}
          onMaxPriceChange={search.setMaxPrice}
          onMinPriceChange={search.setMinPrice}
          validation={search.priceValidation}
        />
      }
      filterGridClassName="database-search-filters__grid--two-column"
      isSearching={search.loading}
      onClearFilters={search.clearFilters}
      onSearch={() => search.submitSearch()}
      renderFields={(nameInputRef) => (
        <>
          <label className="explore-search-field">
            <SearchIcon
              aria-hidden="true"
              className="explore-search-field__icon"
              size={16}
            />
            <input
              aria-label="Sealed product name"
              className="database-search"
              onChange={(event) => search.setName(event.target.value)}
              onKeyDown={search.onKeyDown}
              placeholder="Name"
              ref={nameInputRef}
              value={search.name}
            />
          </label>
          <label className="explore-search-field">
            <AutosuggestCombobox
              ariaLabel="Set name"
              className="database-search-set-combobox"
              clearOnClick
              inputClassName="database-search"
              menuLabel="Sealed set suggestions"
              onInputChange={search.setSetNameFilter}
              onKeyDown={search.onKeyDown}
              onSelect={search.selectSetNameFilter}
              options={search.setOptions}
              placeholder="Set"
              value={search.setNameFilter}
            />
          </label>
          <div className="explore-search-field sealed-search-type-field">
            <SelectDropdown
              ariaLabel="Product type"
              className={`sealed-search-type-select${search.productFamily ? "" : " database-search-placeholder-control"}`}
              onChange={search.selectProductFamily}
              options={search.productFamilyOptions}
              value={search.productFamily}
            />
          </div>
        </>
      )}
      searchDisabled={
        !search.hasCriteria || Boolean(search.priceError) || search.loading
      }
    />
  );
}

export function SealedDatabaseSearchResults({
  onClose,
  search,
}: {
  onClose?: () => void;
  search: SealedDatabaseSearchController;
}) {
  const showResults =
    Boolean(search.activeQueryLabel) &&
    !search.feedback &&
    !(search.loading && search.products.length === 0);

  return (
    <>
      {search.feedback && !search.loading && (
        <p className="database-search-feedback" role="status">
          {search.feedback}
        </p>
      )}
      {showResults && (
        <section className="search-results search-results--grid ui-render-fade">
          <SearchResultsToolbar
            activeQueryLabel={search.activeQueryLabel}
            itemLabel={{
              plural: "sealed products",
              singular: "sealed product",
            }}
            onClose={() => {
              search.closeResults();
              onClose?.();
            }}
            resultCount={search.total}
            sortControl={
              <SelectDropdown
                ariaLabel="Sort search results"
                className="search-results-sort-control__dropdown"
                onChange={search.handleSortChange}
                options={SEALED_SORT_OPTIONS}
                value={search.sortDirection}
              />
            }
          />
          {search.sortedProducts.length > 0 && (
            <GridView revealOnScroll={false} sorting={search.isSorting}>
              {search.sortedProducts
                .slice(0, search.visibleCount)
                .map((product) => (
                  <SealedProductView key={product.id} product={product} />
                ))}
            </GridView>
          )}
          {search.visibleCount < search.sortedProducts.length && (
            <div className="search-results__more">
              <button
                className="search-results__more-button"
                onClick={() =>
                  search.setVisibleCount(
                    (count) => count + SEALED_SEARCH_PAGE_SIZE,
                  )
                }
                type="button"
              >
                Show next 50
                <ChevronDown aria-hidden="true" />
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
