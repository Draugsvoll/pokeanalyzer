import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { PokeTraceSealedCatalogProduct } from "../../../shared/pokeTraceSealed";
import {
  fetchSealedFilterOptions,
  searchSealedProducts,
} from "../../services/sealedApi";
import { logClientError } from "../../utils/logClientError";

export const SEALED_SEARCH_PAGE_SIZE = 50;
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

function formatFilterLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
  const priceValidation = useMemo(() => {
    const min = optionalPrice(minPrice);
    const max = optionalPrice(maxPrice);
    if (minPrice.trim() && min === undefined) {
      return { field: "min" as const, message: "Invalid minimum price" };
    }
    if (maxPrice.trim() && max === undefined) {
      return { field: "max" as const, message: "Invalid maximum price" };
    }
    if (min !== undefined && max !== undefined && min > max) {
      return {
        field: "max" as const,
        message: "Maximum price cannot be lower than minimum price",
      };
    }
    return null;
  }, [maxPrice, minPrice]);
  const priceError = priceValidation?.message ?? null;

  useEffect(() => {
    if (!active || !syncUrl) return;

    const urlSearch = readSealedUrlSearch(new URLSearchParams(searchParamsKey));
    if (!urlSearch) return;

    // These controlled fields intentionally mirror browser navigation state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      setSubmittedSearch(null);
      return;
    }

    const criteria = sealedSearchCriteria(urlSearch);
    if (
      (urlSearch.minPrice && criteria.minPrice === undefined) ||
      (urlSearch.maxPrice && criteria.maxPrice === undefined) ||
      (criteria.minPrice !== undefined &&
        criteria.maxPrice !== undefined &&
        criteria.minPrice > criteria.maxPrice)
    ) {
      setLoading(false);
      setProducts([]);
      setTotal(0);
      setSubmittedSearch(null);
      return;
    }

    setLoading(true);
    setSubmittedSearch(criteria);
  }, [active, searchParamsKey, syncUrl]);

  useEffect(() => {
    if (!active || !submittedSearch) return;
    const controller = new AbortController();
    let current = true;
    void searchSealedProducts(submittedSearch, controller.signal)
      .then((response) => {
        if (!current) return;
        setProducts(response.items);
        setTotal(response.total);
        setVisibleCount(SEALED_SEARCH_PAGE_SIZE);
        setFeedback(
          response.items.length === 0
            ? "No sealed products matched your search."
            : null,
        );
      })
      .catch((error: unknown) => {
        if (!current || controller.signal.aborted) return;
        setProducts([]);
        setTotal(0);
        setFeedback(
          error instanceof Error
            ? error.message
            : "We couldn't complete your search.",
        );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      controller.abort();
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

  function submitSearch() {
    if (!hasCriteria || priceError || loading) return;
    const nextSearch: SealedUrlSearch = {
      maxPrice: maxPrice.trim(),
      minPrice: minPrice.trim(),
      name: name.trim(),
      productFamily: productFamily.trim(),
      setName: setNameFilter.trim(),
    };
    const nextSearchParams = createSealedSearchParams(nextSearch);
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

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitSearch();
  }

  return {
    feedback,
    hasCriteria,
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
    setProductFamily,
    setVisibleCount,
    submitSearch,
    total,
    visibleCount,
  };
}

export type SealedDatabaseSearchController = ReturnType<
  typeof useSealedDatabaseSearch
>;
