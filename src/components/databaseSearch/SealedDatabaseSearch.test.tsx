import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import type { PokeTraceSealedCatalogProduct } from "../../../shared/pokeTraceSealed";
import {
  fetchSealedFilterOptions,
  searchSealedProducts,
} from "../../services/sealedApi";
import {
  SealedDatabaseSearchBar,
  SealedDatabaseSearchResults,
} from "./SealedDatabaseSearch";
import { useSealedDatabaseSearch } from "./useSealedDatabaseSearch";

vi.mock("../../services/sealedApi", () => ({
  fetchSealedFilterOptions: vi.fn(),
  searchSealedProducts: vi.fn(),
}));

const uiMocks = vi.hoisted(() => ({
  waitForUiPaint: vi.fn<() => Promise<void>>(),
}));

vi.mock("../../utils/waitForUiPaint", () => ({
  waitForUiPaint: uiMocks.waitForUiPaint,
}));

vi.mock("../sealedProductView/SealedProductView", () => ({
  SealedProductView: ({
    product,
  }: {
    product: PokeTraceSealedCatalogProduct;
  }) => <p data-testid="sealed-product">{product.name}</p>,
}));

beforeEach(() => {
  uiMocks.waitForUiPaint.mockReset().mockImplementation(
    () =>
      new Promise((resolve) => {
        window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
      }),
  );
  vi.mocked(fetchSealedFilterOptions).mockReset();
  vi.mocked(searchSealedProducts).mockReset();
  vi.mocked(fetchSealedFilterOptions).mockResolvedValue({
    productFamilies: ["booster_box"],
    setNames: ["XY Base Set"],
  });
  vi.mocked(searchSealedProducts).mockResolvedValue({ items: [], total: 0 });
});

function sealedProduct(
  id: string,
  name: string,
  price: number | null,
): PokeTraceSealedCatalogProduct {
  return {
    currency: "USD",
    id,
    name,
    price,
    priceSnapshots: { "1d": null, "7d": null, "30d": null },
    productFamily: "booster_box",
    setName: "XY Base Set",
  };
}

function SealedSearchHarness({ onClose }: { onClose?: () => void }) {
  const search = useSealedDatabaseSearch(true);
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <SealedDatabaseSearchBar search={search} />
      <SealedDatabaseSearchResults onClose={onClose} search={search} />
      <output aria-label="Current search">{location.search}</output>
      <button onClick={() => navigate(-1)} type="button">
        Back
      </button>
    </>
  );
}

test("prefills and searches the sealed set from the URL", async () => {
  render(
    <MemoryRouter initialEntries={["/sealed?set=XY%20Base%20Set"]}>
      <SealedSearchHarness />
    </MemoryRouter>,
  );

  expect(screen.getByRole("combobox", { name: "Set name" })).toHaveValue(
    "XY Base Set",
  );
  await waitFor(() => {
    expect(searchSealedProducts).toHaveBeenCalledWith(
      { name: "", productFamily: "", setName: "XY Base Set" },
      expect.any(AbortSignal),
    );
  });
  expect(
    await screen.findByText(/0 sealed products matching .*XY Base Set/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Sort search results" }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Close search results" }),
  ).toBeVisible();
});

test("uses the shared results toolbar to sort and close sealed results", async () => {
  const onClose = vi.fn();
  vi.mocked(searchSealedProducts).mockResolvedValue({
    items: [
      sealedProduct("expensive", "Expensive Box", 200),
      sealedProduct("cheap", "Cheap Box", 50),
    ],
    total: 2,
  });

  render(
    <MemoryRouter initialEntries={["/sealed?mode=sealed&name=Box"]}>
      <SealedSearchHarness onClose={onClose} />
    </MemoryRouter>,
  );

  expect(
    await screen.findByText(/2 sealed products matching .*Box/),
  ).toBeVisible();
  expect(
    screen.getAllByTestId("sealed-product").map((node) => node.textContent),
  ).toEqual(["Expensive Box", "Cheap Box"]);

  fireEvent.click(screen.getByRole("button", { name: "Sort search results" }));
  fireEvent.click(screen.getByRole("option", { name: "Price: low–high" }));

  expect(document.querySelector(".card-grid")).toHaveClass(
    "card-grid--sorting",
  );
  await waitFor(() =>
    expect(
      screen.getAllByTestId("sealed-product").map((node) => node.textContent),
    ).toEqual(["Cheap Box", "Expensive Box"]),
  );
  expect(document.querySelector(".card-grid")).not.toHaveClass(
    "card-grid--sorting",
  );

  fireEvent.click(screen.getByRole("button", { name: "Close search results" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/sealed products matching/)).toBeNull();
});

test("resets sealed pagination when sorting", async () => {
  vi.mocked(searchSealedProducts).mockResolvedValue({
    items: Array.from({ length: 51 }, (_, index) =>
      sealedProduct(String(index), `Box ${index + 1}`, 51 - index),
    ),
    total: 51,
  });

  render(
    <MemoryRouter initialEntries={["/sealed?mode=sealed&name=Box"]}>
      <SealedSearchHarness />
    </MemoryRouter>,
  );

  expect(
    await screen.findByRole("button", { name: "Show next 50" }),
  ).toBeVisible();
  expect(screen.getAllByTestId("sealed-product")).toHaveLength(50);
  fireEvent.click(screen.getByRole("button", { name: "Show next 50" }));
  expect(screen.getAllByTestId("sealed-product")).toHaveLength(51);

  fireEvent.click(screen.getByRole("button", { name: "Sort search results" }));
  fireEvent.click(screen.getByRole("option", { name: "Price: low–high" }));

  await waitFor(() =>
    expect(screen.getAllByTestId("sealed-product")).toHaveLength(50),
  );
  expect(screen.getByRole("button", { name: "Show next 50" })).toBeVisible();
});

test("invalidates a pending sort when a new search begins", async () => {
  let resolveSort!: () => void;
  uiMocks.waitForUiPaint.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveSort = resolve;
      }),
  );
  vi.mocked(searchSealedProducts)
    .mockResolvedValueOnce({
      items: [
        sealedProduct("initial-expensive", "Initial Expensive", 200),
        sealedProduct("initial-cheap", "Initial Cheap", 50),
      ],
      total: 2,
    })
    .mockResolvedValueOnce({
      items: [
        sealedProduct("new-expensive", "New Expensive", 300),
        sealedProduct("new-cheap", "New Cheap", 25),
      ],
      total: 2,
    });

  render(
    <MemoryRouter initialEntries={["/sealed?mode=sealed&name=initial"]}>
      <SealedSearchHarness />
    </MemoryRouter>,
  );

  expect(await screen.findByText("Initial Expensive")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Sort search results" }));
  fireEvent.click(screen.getByRole("option", { name: "Price: low–high" }));

  fireEvent.change(
    screen.getByRole("textbox", { name: "Sealed product name" }),
    { target: { value: "new" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(await screen.findByText("New Expensive")).toBeVisible();
  await act(async () => {
    resolveSort();
    await Promise.resolve();
  });

  expect(
    screen.getAllByTestId("sealed-product").map((node) => node.textContent),
  ).toEqual(["New Expensive", "New Cheap"]);
  expect(
    screen.getByRole("button", { name: "Sort search results" }),
  ).toHaveTextContent("Unsorted");
});

test("keeps sealed results closed when an active request resolves late", async () => {
  let resolvePendingSearch!: (response: {
    items: PokeTraceSealedCatalogProduct[];
    total: number;
  }) => void;
  const pendingSearch = new Promise<{
    items: PokeTraceSealedCatalogProduct[];
    total: number;
  }>((resolve) => {
    resolvePendingSearch = resolve;
  });
  vi.mocked(searchSealedProducts)
    .mockResolvedValueOnce({
      items: [sealedProduct("first", "First Box", 100)],
      total: 1,
    })
    .mockImplementationOnce(() => pendingSearch);

  render(
    <MemoryRouter initialEntries={["/sealed?mode=sealed&name=first"]}>
      <SealedSearchHarness />
    </MemoryRouter>,
  );

  expect(await screen.findByText("First Box")).toBeVisible();
  fireEvent.change(
    screen.getByRole("textbox", { name: "Sealed product name" }),
    { target: { value: "second" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  await waitFor(() => expect(searchSealedProducts).toHaveBeenCalledTimes(2));
  const pendingSignal = vi.mocked(searchSealedProducts).mock.calls[1]?.[1];
  fireEvent.click(screen.getByRole("button", { name: "Close search results" }));

  expect(pendingSignal?.aborted).toBe(true);
  await act(async () => {
    resolvePendingSearch({
      items: [sealedProduct("late", "Late Box", 200)],
      total: 1,
    });
    await pendingSearch;
  });

  expect(screen.queryByText("Late Box")).toBeNull();
  expect(screen.queryByText(/sealed products matching/)).toBeNull();
});

test("aborts an active request before starting a forced replacement search", async () => {
  let resolveFirstSearch!: (response: {
    items: PokeTraceSealedCatalogProduct[];
    total: number;
  }) => void;
  let resolveReplacementSearch!: (response: {
    items: PokeTraceSealedCatalogProduct[];
    total: number;
  }) => void;
  const firstSearch = new Promise<{
    items: PokeTraceSealedCatalogProduct[];
    total: number;
  }>((resolve) => {
    resolveFirstSearch = resolve;
  });
  const replacementSearch = new Promise<{
    items: PokeTraceSealedCatalogProduct[];
    total: number;
  }>((resolve) => {
    resolveReplacementSearch = resolve;
  });
  vi.mocked(searchSealedProducts)
    .mockImplementationOnce(() => firstSearch)
    .mockImplementationOnce(() => replacementSearch);

  render(
    <MemoryRouter initialEntries={["/sealed?mode=sealed&name=Box"]}>
      <SealedSearchHarness />
    </MemoryRouter>,
  );

  await waitFor(() => expect(searchSealedProducts).toHaveBeenCalledTimes(1));
  const firstSignal = vi.mocked(searchSealedProducts).mock.calls[0]?.[1];
  fireEvent.click(screen.getByRole("button", { name: "Product type" }));
  fireEvent.click(await screen.findByRole("option", { name: "Booster Box" }));

  expect(firstSignal?.aborted).toBe(true);
  await waitFor(() => expect(searchSealedProducts).toHaveBeenCalledTimes(2));

  await act(async () => {
    resolveFirstSearch({
      items: [sealedProduct("stale", "Stale Box", 100)],
      total: 1,
    });
    await firstSearch;
  });
  expect(screen.queryByText("Stale Box")).toBeNull();

  await act(async () => {
    resolveReplacementSearch({
      items: [sealedProduct("replacement", "Replacement Box", 200)],
      total: 1,
    });
    await replacementSearch;
  });
  expect(await screen.findByText("Replacement Box")).toBeVisible();
});

test("searches when a sealed set suggestion is selected", async () => {
  render(
    <MemoryRouter initialEntries={["/sealed"]}>
      <SealedSearchHarness />
    </MemoryRouter>,
  );

  const setInput = screen.getByRole("combobox", { name: "Set name" });
  fireEvent.change(setInput, { target: { value: "xy" } });
  fireEvent.click(await screen.findByRole("option", { name: "XY Base Set" }));

  await waitFor(() => {
    expect(searchSealedProducts).toHaveBeenCalledWith(
      { name: "", productFamily: "", setName: "XY Base Set" },
      expect.any(AbortSignal),
    );
  });

  vi.mocked(searchSealedProducts).mockClear();
  fireEvent.click(setInput);
  expect(setInput).toHaveValue("");
  expect(searchSealedProducts).not.toHaveBeenCalled();
});

test("searches when a sealed product type is selected", async () => {
  render(
    <MemoryRouter initialEntries={["/sealed"]}>
      <SealedSearchHarness />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Product type" })).toBeEnabled();
  });
  fireEvent.click(screen.getByRole("button", { name: "Product type" }));
  fireEvent.click(await screen.findByRole("option", { name: "Booster Box" }));

  await waitFor(() => {
    expect(searchSealedProducts).toHaveBeenCalledWith(
      { name: "", productFamily: "booster_box", setName: "" },
      expect.any(AbortSignal),
    );
  });
});

test("stores sealed criteria in history and restores searches on Back", async () => {
  render(
    <MemoryRouter initialEntries={["/sealed"]}>
      <SealedSearchHarness />
    </MemoryRouter>,
  );

  const nameInput = screen.getByRole("textbox", {
    name: "Sealed product name",
  });
  fireEvent.change(nameInput, { target: { value: "first box" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  await waitFor(() => {
    expect(searchSealedProducts).toHaveBeenLastCalledWith(
      {
        name: "first box",
        productFamily: "",
        setName: "",
      },
      expect.any(AbortSignal),
    );
  });
  expect(screen.getByLabelText("Current search")).toHaveTextContent(
    "?mode=sealed&name=first+box",
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
  });
  fireEvent.change(nameInput, { target: { value: "second box" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  await waitFor(() => {
    expect(searchSealedProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "second box" }),
      expect.any(AbortSignal),
    );
  });

  fireEvent.click(screen.getByRole("button", { name: "Back" }));

  await waitFor(() => {
    expect(nameInput).toHaveValue("first box");
    expect(searchSealedProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "first box" }),
      expect.any(AbortSignal),
    );
  });
});

test("writes every submitted Sealed filter to the URL", async () => {
  render(
    <MemoryRouter initialEntries={["/sealed"]}>
      <SealedSearchHarness />
    </MemoryRouter>,
  );

  fireEvent.change(
    screen.getByRole("textbox", { name: "Sealed product name" }),
    { target: { value: "Booster" } },
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Set name" }), {
    target: { value: "XY Base Set" },
  });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Product type" })).toBeEnabled();
  });
  fireEvent.click(screen.getByRole("button", { name: "Product type" }));
  fireEvent.click(await screen.findByRole("option", { name: "Booster Box" }));
  fireEvent.click(screen.getByRole("button", { name: "Search filters" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Minimum price" }), {
    target: { value: "100" },
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum price" }), {
    target: { value: "500" },
  });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  await waitFor(() => {
    const params = new URLSearchParams(
      screen.getByLabelText("Current search").textContent ?? "",
    );
    expect(Object.fromEntries(params)).toEqual({
      max: "500",
      min: "100",
      mode: "sealed",
      name: "Booster",
      set: "XY Base Set",
      type: "booster_box",
    });
  });
});

test("removes cleared Sealed filters from the URL", async () => {
  render(
    <MemoryRouter
      initialEntries={["/sealed?mode=sealed&name=Booster&min=100&max=500"]}
    >
      <SealedSearchHarness />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole("button", { name: /^Search filters,/ }));
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

  await waitFor(() => {
    const params = new URLSearchParams(
      screen.getByLabelText("Current search").textContent ?? "",
    );
    expect(Object.fromEntries(params)).toEqual({
      mode: "sealed",
      name: "Booster",
    });
  });
  expect(screen.getByRole("spinbutton", { name: "Minimum price" })).toHaveValue(
    null,
  );
  expect(screen.getByRole("spinbutton", { name: "Maximum price" })).toHaveValue(
    null,
  );
});
