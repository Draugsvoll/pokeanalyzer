import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import {
  SealedProductPortfolioView,
  SealedProductView,
} from "./SealedProductView";

const mocks = vi.hoisted(() => ({
  auth: { loading: false, user: null as null | { uid: string } },
  isItemSaved: vi.fn(() => false),
  removeSealedFromPortfolio: vi.fn(),
  saveSealedToPortfolio: vi.fn(),
  updateSealedQuantity: vi.fn(),
}));

vi.mock("../../context/authContextValue", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("../../context/portfolioCacheContextValue", () => ({
  usePortfolioCache: () => ({
    isItemSaved: mocks.isItemSaved,
    loadingPortfolioReferences: false,
    portfolioReferencesError: null,
  }),
}));

vi.mock("../../hooks/sealedPortfolio", () => ({
  useSealedPortfolio: () => ({
    removeSealedFromPortfolio: mocks.removeSealedFromPortfolio,
    saveSealedToPortfolio: mocks.saveSealedToPortfolio,
    updateSealedQuantity: mocks.updateSealedQuantity,
  }),
}));

beforeEach(() => {
  mocks.auth.user = null;
  mocks.isItemSaved.mockReset().mockReturnValue(false);
  mocks.removeSealedFromPortfolio.mockReset();
  mocks.saveSealedToPortfolio.mockReset().mockResolvedValue(true);
  mocks.updateSealedQuantity.mockReset().mockResolvedValue(true);
});

test("renders the sealed product family and variant", () => {
  render(
    <MemoryRouter>
      <SealedProductView
        product={{
          id: "019bff85-5452-714a-9660-a3559a2d5d95",
          name: "XY Booster Box",
          setName: "XY Base Set",
          productFamily: "booster_box",
          variant: "pokemon_center_exclusive",
          currency: "USD",
          price: 150,
          priceSnapshots: { "1d": null, "7d": 125, "30d": null },
        }}
      />
    </MemoryRouter>,
  );

  expect(screen.getByText("Booster Box")).toBeInTheDocument();
  expect(screen.getByText("Pokemon Center Exclusive")).toBeInTheDocument();
});

test("replaces a broken product image with a clean fallback", () => {
  render(
    <MemoryRouter>
      <SealedProductView
        product={{
          id: "product-with-broken-image",
          name: "Broken Image Box",
          setName: "Example Set",
          productFamily: "booster_box",
          variant: "normal",
          currency: "USD",
          image: "https://example.com/missing.jpg",
          price: 100,
          priceSnapshots: { "1d": null, "7d": null, "30d": null },
        }}
      />
    </MemoryRouter>,
  );

  const image = document.querySelector(".sealed-product-view__image-shell img");
  expect(image).toBeInTheDocument();
  fireEvent.error(image!);
  expect(image).not.toBeInTheDocument();
  expect(screen.queryByText("Image unavailable")).not.toBeInTheDocument();
});

test("adds a sealed search result to the portfolio", async () => {
  mocks.auth.user = { uid: "user-1" };
  const product = {
    id: "sealed-1",
    name: "Base Set Booster Box",
    setName: "Base Set",
    productFamily: "booster_box",
    currency: "USD",
    price: 150,
    priceSnapshots: { "1d": null, "7d": 125, "30d": null },
  } as const;

  const onPortfolioChanged = vi.fn();
  render(
    <MemoryRouter>
      <SealedProductView
        onPortfolioChanged={onPortfolioChanged}
        product={product}
      />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Add to portfolio" }));

  await waitFor(() =>
    expect(mocks.saveSealedToPortfolio).toHaveBeenCalledWith(product),
  );
  expect(onPortfolioChanged).toHaveBeenCalledWith(true);
});

test("updates a sealed product quantity through the shared portfolio controls", async () => {
  const onQuantityUpdated = vi.fn();

  render(
    <MemoryRouter>
      <SealedProductPortfolioView
        comparisonPeriod="7d"
        onQuantityUpdated={onQuantityUpdated}
        product={{
          currency: "USD",
          id: "sealed-1",
          name: "Base Set Booster Box",
          price: 150,
          priceSnapshots: { "1d": null, "7d": 125, "30d": null },
          productFamily: "booster_box",
          quantity: 2,
          setName: "Base Set",
          type: "sealed",
        }}
      />
    </MemoryRouter>,
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: "Increase Base Set Booster Box quantity",
    }),
  );
  expect(screen.getByRole("dialog")).toHaveTextContent("Quantity: 3");

  fireEvent.click(
    screen.getByRole("button", { name: "Apply quantity change" }),
  );

  await waitFor(() =>
    expect(mocks.updateSealedQuantity).toHaveBeenCalledWith("sealed-1", 3),
  );
  expect(onQuantityUpdated).toHaveBeenCalledWith("sealed-1", 3);
});
