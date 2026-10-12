import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { PokeTraceSealedCatalogProduct } from "../../../shared/pokeTraceSealed";
import {
  fetchSealedFilterOptions,
  searchSealedProducts,
} from "../../services/sealedApi";
import { logClientError } from "../../utils/logClientError";
import { waitForUiPaint } from "../../utils/waitForUiPaint";

export const SEALED_SEARCH_PAGE_SIZE = 50;
export type SealedProductSort =
  "none" | "name-az" | "price-high-low" | "price-low-high";
type SealedSearchCriteria = Parameters<typeof searchSealedProducts>[0];

type SealedUrlSearch = {
  maxPrice: string;
  minPrice: string;
  name: string;
  productFamily: string;
  setName: string;
};

function optionalPrice(value: string) {
  if (!value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function validateSealedPriceFilters(
  search: Pick<SealedUrlSearch, "maxPrice" | "minPrice">,
) {
  const min = optionalPrice(search.minPrice);
  const max = optionalPrice(search.maxPrice);
  if (search.minPrice.trim() && min === undefined) {
    return { field: "min" as const, message: "Invalid minimum price" };
  }
  if (search.maxPrice.trim() && max === undefined) {
    return { field: "max" as const, message: "Invalid maximum price" };
  }
  if (min !== undefined && max !== undefined && min > max) {
    return {
      field: "max" as const,
      message: "Maximum price cannot be lower than minimum price",
    };
  }
  return null;
}

function formatFilterLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatSearchLabel(search: SealedSearchCriteria) {
  return [
    search.name,
    search.setName,
    search.productFamily && formatFilterLabel(search.productFamily),
    search.minPrice !== undefined && search.maxPrice !== undefined
      ? `$${search.minPrice}–$${search.maxPrice}`
      : search.minPrice !== undefined
        ? `$${search.minPrice}+`
        : search.maxPrice !== undefined
          ? `Up to $${search.maxPrice}`
          : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function sortSealedProducts(
  products: readonly PokeTraceSealedCatalogProduct[],
  sort: SealedProductSort,
) {
  if (sort === "none") return [...products];

  return [...products].sort((left, right) => {
    if (sort === "name-az") {
      return (
        left.name.localeCompare(right.name, "en-US", {
          numeric: true,
          sensitivity: "base",
        }) || left.id.localeCompare(right.id, "en-US")
      );
    }

    const leftPrice = left.price;
    const rightPrice = right.price;
    if (leftPrice == null && rightPrice != null) return 1;
    if (leftPrice != null && rightPrice == null) return -1;
    if (leftPrice != null && rightPrice != null && leftPrice !== rightPrice) {
      return sort === "price-high-low"
        ? rightPrice - leftPrice
        : leftPrice - rightPrice;
    }
    return (
      left.name.localeCompare(right.name, "en-US", {
        numeric: true,
        sensitivity: "base",
      }) || left.id.localeCompare(right.id, "en-US")
    );
  });
}

function readSealedUrlSearch(searchParams: URLSearchParams) {
  if (searchParams.get("mode") === "singles") return null;

  return {
    maxPrice: searchParams.get("max")?.trim() ?? "",
    minPrice: searchParams.get("min")?.trim() ?? "",
    name: searchParams.get("name")?.trim() ?? "",
    productFamily: searchParams.get("type")?.trim() ?? "",
    setName: searchParams.get("set")?.trim() ?? "",
  } satisfies SealedUrlSearch;
}

function sealedSearchCriteria(search: SealedUrlSearch): SealedSearchCriteria {
  const minPrice = optionalPrice(search.minPrice);
  const maxPrice = optionalPrice(search.maxPrice);
  return {
    name: search.name,
    productFamily: search.productFamily,
    setName: search.setName,
    ...(minPrice !== undefined && { minPrice }),
    ...(maxPrice !== undefined && { maxPrice }),
  };
}

function hasSealedSearchCriteria(search: SealedUrlSearch) {
  return Boolean(
    search.name ||
    search.setName ||
    search.productFamily ||
    search.minPrice ||
    search.maxPrice,
  );
}

function createSealedSearchParams(search: SealedUrlSearch) {
  const searchParams = new URLSearchParams({ mode: "sealed" });
  if (search.name) searchParams.set("name", search.name);
  if (search.setName) searchParams.set("set", search.setName);
  if (search.productFamily) searchParams.set("type", search.productFamily);
  if (search.minPrice) searchParams.set("min", search.minPrice);
  if (search.maxPrice) searchParams.set("max", search.maxPrice);
  return searchParams;
}

export function useSealedDatabaseSearch(active: boolean, syncUrl = true) {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchRequestControllerRef = useRef<AbortController | null>(null);
  const sortRequestIdRef = useRef(0);
  const initialSearch = (syncUrl
    ? readSealedUrlSearch(searchParams)
    : null) ?? {
    maxPrice: "",
    minPrice: "",
    name: "",
    productFamily: "",
    setName: "",
  };
  const searchParamsKey = searchParams.toString();
  const [name, setName] = useState(initialSearch.name);
  const [setNameFilter, setSetNameFilter] = useState(initialSearch.setName);
  const [productFamily, setProductFamily] = useState(
    initialSearch.productFamily,
  );
  const [minPrice, setMinPrice] = useState(initialSearch.minPrice);
  const [maxPrice, setMaxPrice] = useState(initialSearch.maxPrice);
  const [products, setProducts] = useState<PokeTraceSealedCatalogProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [visibleCount, setVisibleCount] = useState(SEALED_SEARCH_PAGE_SIZE);
  const [loading, setLoading] = useState(
    Boolean(active && hasSealedSearchCriteria(initialSearch)),
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeQueryLabel, setActiveQueryLabel] = useState("");
  const [isSorting, setIsSorting] = useState(false);
  const [sortDirection, setSortDirection] = useState<SealedProductSort>("none");
  const [setNames, setSetNames] = useState<string[]>([]);
  const [productFamilies, setProductFamilies] = useState<string[]>([]);
  const [submittedSearch, setSubmittedSearch] =
    useState<SealedSearchCriteria | null>(null);

  const setOptions = useMemo(
    () => setNames.map((setName) => ({ label: setName, value: setName })),
    [setNames],
  );
  const productFamilyOptions = useMemo(
    () => [
      { label: "Type", value: "" },
      ...productFamilies.map((family) => ({
        label: formatFilterLabel(family),
        value: family,
      })),
    ],
    [productFamilies],
  );
  const hasCriteria = Boolean(
    name.trim() ||
    setNameFilter.trim() ||
    productFamily.trim() ||
    minPrice.trim() ||
    maxPrice.trim(),
  );
  const priceValidation = useMemo(
    () => validateSealedPriceFilters({ maxPrice, minPrice }),
    [maxPrice, minPrice],
  );
  const priceError = priceValidation?.message ?? null;
  const sortedProducts = useMemo(
    () => sortSealedProducts(products, sortDirection),
    [products, sortDirection],
  );

  function cancelPendingSort() {
    sortRequestIdRef.current += 1;
    setIsSorting(false);
  }

  function cancelActiveSearch() {
    const controller = searchRequestControllerRef.current;
    searchRequestControllerRef.current = null;
    controller?.abort();
  }

  useEffect(
    () => () => {
      sortRequestIdRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (!active || !syncUrl) return;

    const urlSearch = readSealedUrlSearch(new URLSearchParams(searchParamsKey));
    if (!urlSearch) return;

    cancelActiveSearch();
    // These controlled fields intentionally mirror browser navigation state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cancelPendingSort();
    setName(urlSearch.name);
    setSetNameFilter(urlSearch.setName);
    setProductFamily(urlSearch.productFamily);
    setMinPrice(urlSearch.minPrice);
    setMaxPrice(urlSearch.maxPrice);
    setFeedback(null);
    setVisibleCount(SEALED_SEARCH_PAGE_SIZE);

    if (!hasSealedSearchCriteria(urlSearch)) {
      setLoading(false);
      setProducts([]);
      setTotal(0);
      setActiveQueryLabel("");
      setSubmittedSearch(null);
      return;
    }

    if (validateSealedPriceFilters(urlSearch)) {
      setLoading(false);
      setProducts([]);
      setTotal(0);
      setActiveQueryLabel("");
      setSubmittedSearch(null);
      return;
    }

    setLoading(true);
    setSubmittedSearch(sealedSearchCriteria(urlSearch));
  }, [active, searchParamsKey, syncUrl]);

  useEffect(() => {
    if (!active || !submittedSearch) return;
    cancelActiveSearch();
    const controller = new AbortController();
    searchRequestControllerRef.current = controller;
    let current = true;
    void searchSealedProducts(submittedSearch, controller.signal)
      .then((response) => {
        if (!current || controller.signal.aborted) return;
        setProducts(response.items);
        setTotal(response.total);
        setVisibleCount(SEALED_SEARCH_PAGE_SIZE);
        setSortDirection("none");
        setActiveQueryLabel(formatSearchLabel(submittedSearch));
        setFeedback(null);
      })
      .catch((error: unknown) => {
        if (!current || controller.signal.aborted) return;
        setProducts([]);
        setTotal(0);
        setActiveQueryLabel("");
        setFeedback(
          error instanceof Error
            ? error.message
            : "We couldn't complete your search.",
        );
      })
      .finally(() => {
        if (!current || searchRequestControllerRef.current !== controller)
          return;
        searchRequestControllerRef.current = null;
        setLoading(false);
      });
    return () => {
      current = false;
      controller.abort();
      if (searchRequestControllerRef.current === controller) {
        searchRequestControllerRef.current = null;
      }
    };
  }, [active, submittedSearch]);

  useEffect(() => {
    if (!active || setNames.length > 0 || productFamilies.length > 0) return;
    const controller = new AbortController();
    void fetchSealedFilterOptions(controller.signal)
      .then((options) => {
        setSetNames(options.setNames);
        setProductFamilies(options.productFamilies);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          logClientError("Failed to load sealed filter options", error);
        }
      });
    return () => controller.abort();
  }, [active, productFamilies.length, setNames.length]);

  function currentSearch(
    overrides: Partial<SealedUrlSearch> = {},
  ): SealedUrlSearch {
    return {
      maxPrice: (overrides.maxPrice ?? maxPrice).trim(),
      minPrice: (overrides.minPrice ?? minPrice).trim(),
      name: (overrides.name ?? name).trim(),
      productFamily: (overrides.productFamily ?? productFamily).trim(),
      setName: (overrides.setName ?? setNameFilter).trim(),
    };
  }

  function startSearch(nextSearch: SealedUrlSearch, force = false) {
    if ((!force && loading) || validateSealedPriceFilters(nextSearch)) return;
    cancelActiveSearch();
    cancelPendingSort();
    const nextSearchParams = createSealedSearchParams(nextSearch);
    if (!hasSealedSearchCriteria(nextSearch)) {
      setLoading(false);
      setFeedback(null);
      setProducts([]);
      setTotal(0);
      setActiveQueryLabel("");
      setSubmittedSearch(null);
      if (syncUrl && nextSearchParams.toString() !== searchParamsKey) {
        setSearchParams(nextSearchParams);
      }
      return;
    }
    setLoading(true);
    setFeedback(null);
    if (!syncUrl) {
      setSubmittedSearch(sealedSearchCriteria(nextSearch));
      return;
    }
    if (nextSearchParams.toString() === searchParamsKey) {
      setSubmittedSearch(sealedSearchCriteria(nextSearch));
      return;
    }
    setSearchParams(nextSearchParams);
  }

  function submitSearch() {
    if (!hasCriteria || priceError) return;
    startSearch(currentSearch());
  }

  function selectSetNameFilter(value: string) {
    setSetNameFilter(value);
    startSearch(currentSearch({ setName: value }), true);
  }

  function selectProductFamily(value: string) {
    setProductFamily(value);
    startSearch(currentSearch({ productFamily: value }), true);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitSearch();
  }

  function clearFilters() {
    setMinPrice("");
    setMaxPrice("");
    if (!syncUrl) return;

    const nextSearchParams = new URLSearchParams(searchParamsKey);
    nextSearchParams.delete("min");
    nextSearchParams.delete("max");
    if (nextSearchParams.toString() !== searchParamsKey) {
      setSearchParams(nextSearchParams, { replace: true });
    }
  }

  async function handleSortChange(nextSort: SealedProductSort) {
    if (nextSort === sortDirection || loading || isSorting) return;
    const requestId = ++sortRequestIdRef.current;
    setIsSorting(true);
    await waitForUiPaint();
    if (requestId !== sortRequestIdRef.current) return;
    setSortDirection(nextSort);
    setVisibleCount(SEALED_SEARCH_PAGE_SIZE);
    setIsSorting(false);
  }

  function closeResults() {
    cancelActiveSearch();
    cancelPendingSort();
    setLoading(false);
    setFeedback(null);
    setProducts([]);
    setTotal(0);
    setVisibleCount(SEALED_SEARCH_PAGE_SIZE);
    setSortDirection("none");
    setActiveQueryLabel("");
    setSubmittedSearch(null);
  }

  return {
    activeQueryLabel,
    clearFilters,
    closeResults,
    feedback,
    handleSortChange,
    hasCriteria,
    isSorting,
    loading,
    maxPrice,
    minPrice,
    name,
    onKeyDown,
    priceError,
    priceValidation,
    productFamily,
    productFamilyOptions,
    products,
    setMaxPrice,
    setMinPrice,
    setName,
    setNameFilter,
    setSetNameFilter,
    setOptions,
    selectProductFamily,
    selectSetNameFilter,
    setVisibleCount,
    sortDirection,
    sortedProducts,
    submitSearch,
    total,
    visibleCount,
  };
}

export type SealedDatabaseSearchController = ReturnType<
  typeof useSealedDatabaseSearch
>;
