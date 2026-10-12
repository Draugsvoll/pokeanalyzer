import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import {
  POKETRACE_SEALED_SEARCH_RESULT_LIMIT,
  type PokeTraceSealedCatalogProduct,
  type PokeTraceSealedSearchResponse,
} from "../../../shared/pokeTraceSealed";
import { searchSealedProducts } from "../../services/sealedApi";
import { SetTopSealedGrid } from "./SetTopSealedGrid";

vi.mock("../../services/sealedApi", () => ({ searchSealedProducts: vi.fn() }));
vi.mock("../../components/gridView/GridView", () => ({
  GridView: ({
    children,
    title,
    subtitle,
    minimized,
  }: {
    children: ReactNode;
    title: string;
    subtitle: string;
    minimized?: boolean;
  }) => (
    <section aria-label={`${title} ${subtitle}`} data-minimized={minimized}>
      {children}
    </section>
  ),
}));
vi.mock("../../components/sealedProductView/SealedProductView", () => ({
  SealedProductView: ({
    product,
  }: {
    product: PokeTraceSealedCatalogProduct;
  }) => <span>{product.name}</span>,
}));

function product(
  id: string,
  price: number | null,
  setName = "Base Set",
): PokeTraceSealedCatalogProduct {
  return {
    id,
    name: id,
    price,
    setName,
    productFamily: "booster_box",
    currency: "USD",
    priceSnapshots: { "1d": null, "7d": null, "30d": null },
  };
}

beforeEach(() => {
  vi.mocked(searchSealedProducts).mockReset();
});

test("shows the 12 most valuable exact-set products in a minimized grid", async () => {
  const items = Array.from({ length: 20 }, (_, index) =>
    product(`Product ${index + 1}`, index + 1),
  );
  items.push(
    product("Other set", 1000, "Base Set 2"),
    product("Unpriced", null),
    product("Zero", 0),
  );
  vi.mocked(searchSealedProducts).mockResolvedValue({
    items,
    total: items.length,
  });
  render(<SetTopSealedGrid setName=" Base Set " />);
  const grid = await screen.findByRole("region", {
    name: "Most Valuable in This Set Base Set",
  });
  expect(searchSealedProducts).toHaveBeenCalledWith(
    { name: "", productFamily: "", setName: "Base Set" },
    expect.any(AbortSignal),
  );
  expect(grid).toHaveAttribute("data-minimized", "true");
  expect(Array.from(grid.children, (child) => child.textContent)).toEqual(
    Array.from({ length: 12 }, (_, index) => `Product ${20 - index}`),
  );
  expect(items[0].name).toBe("Product 1");
});

test.each([
  { items: [], total: 0 },
  { items: [product("Unpriced", null)], total: 1 },
  { items: [product("Incomplete", 10)], total: 2 },
  {
    items: Array.from(
      { length: POKETRACE_SEALED_SEARCH_RESULT_LIMIT },
      (_, index) => product(`Product ${index}`, 10),
    ),
    total: POKETRACE_SEALED_SEARCH_RESULT_LIMIT,
  },
])("omits empty, unpriced, incomplete or capped results %#", async (result) => {
  vi.mocked(searchSealedProducts).mockResolvedValue(result);
  const { container } = render(<SetTopSealedGrid setName="Base Set" />);
  await act(async () => {});
  expect(container).toBeEmptyDOMElement();
});

test("skips missing set names and hides errors", async () => {
  const { container, rerender } = render(<SetTopSealedGrid setName=" " />);
  expect(searchSealedProducts).not.toHaveBeenCalled();
  vi.mocked(searchSealedProducts).mockRejectedValue(new Error("Unavailable"));
  rerender(<SetTopSealedGrid setName="Base Set" />);
  await act(async () => {});
  expect(container).toBeEmptyDOMElement();
});

test("aborts obsolete requests and ignores their results", async () => {
  let resolveFirst!: (result: PokeTraceSealedSearchResponse) => void;
  vi.mocked(searchSealedProducts)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    )
    .mockResolvedValueOnce({
      items: [product("New product", 100, "Jungle")],
      total: 1,
    });
  const { rerender, unmount } = render(<SetTopSealedGrid setName="Base Set" />);
  const oldSignal = vi.mocked(searchSealedProducts).mock.calls[0][1];
  rerender(<SetTopSealedGrid setName="Jungle" />);
  expect(oldSignal?.aborted).toBe(true);
  await screen.findByText("New product");
  await act(async () =>
    resolveFirst({ items: [product("Old product", 200)], total: 1 }),
  );
  expect(screen.queryByText("Old product")).not.toBeInTheDocument();
  const signal = vi.mocked(searchSealedProducts).mock.calls[1][1];
  unmount();
  expect(signal?.aborted).toBe(true);
});
