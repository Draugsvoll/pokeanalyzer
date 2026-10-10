import { ChevronDown, Search as SearchIcon } from "lucide-react";
import { AutosuggestCombobox } from "../autosuggestCombobox/AutosuggestCombobox";
import { GridView } from "../gridView/GridView";
import { SealedProductView } from "../sealedProductView/SealedProductView";
import { SelectDropdown } from "../selectDropdown/SelectDropdown";
import {
  SEALED_SEARCH_PAGE_SIZE,
  type SealedDatabaseSearchController,
} from "./useSealedDatabaseSearch";
import {
  DatabaseSearchBarShell,
  DatabaseSearchPriceFields,
} from "./DatabaseSearchBarShell";

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
      onSearch={search.submitSearch}
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
              inputClassName="database-search"
              menuLabel="Sealed set suggestions"
              onInputChange={search.setSetNameFilter}
              onKeyDown={search.onKeyDown}
              onSelect={search.setSetNameFilter}
              options={search.setOptions}
              placeholder="Set"
              value={search.setNameFilter}
            />
          </label>
          <div className="explore-search-field sealed-search-type-field">
            <SelectDropdown
              ariaLabel="Product type"
              className={`sealed-search-type-select${search.productFamily ? "" : " database-search-placeholder-control"}`}
              onChange={search.setProductFamily}
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
  onPortfolioChanged,
  search,
}: {
  onPortfolioChanged?: (saved: boolean) => void;
  search: SealedDatabaseSearchController;
}) {
  return (
    <>
      {search.feedback && !search.loading && (
        <p className="database-search-feedback" role="status">
          {search.feedback}
        </p>
      )}
      {search.products.length > 0 && (
        <section className="sealed-results ui-render-fade">
          <header className="sealed-results__header">
            <span>{search.total} sealed products</span>
          </header>
          <GridView revealOnScroll={false}>
            {search.products.slice(0, search.visibleCount).map((product) => (
              <SealedProductView
                key={product.id}
                onPortfolioChanged={onPortfolioChanged}
                product={product}
              />
            ))}
          </GridView>
          {search.visibleCount < search.products.length && (
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
