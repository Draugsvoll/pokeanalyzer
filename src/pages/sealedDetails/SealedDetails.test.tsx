import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import {
  fetchSealedMarketPriceHistory,
  fetchSealedProduct,
} from "../../services/sealedApi";
import SealedDetails from "./SealedDetails";

vi.mock("../../services/sealedApi", () => ({
  fetchSealedMarketPriceHistory: vi.fn(),
  fetchSealedProduct: vi.fn(),
}));

const productId = "019bff85-5452-714a-9660-a3559a2d5d95";

beforeEach(() => {
  vi.mocked(fetchSealedMarketPriceHistory).mockReset();
  vi.mocked(fetchSealedProduct).mockReset();
});

test("renders stored sealed details with live graph data", async () => {
  vi.mocked(fetchSealedMarketPriceHistory).mockResolvedValue({
    productId,
    condition: "UNOPENED",
    period: "90d",
    currency: "USD",
    fetchedAt: "2026-10-05T12:00:00.000Z",
    stale: false,
    series: {
      tcgplayer: [
        {
          date: "2026-10-05",
          avg: 150,
          median7d: null,
          median30d: null,
          low: 145,
          high: 160,
          saleCount: 8,
          approxSaleCount: false,
        },
      ],
    },
  });
  vi.mocked(fetchSealedProduct).mockResolvedValue({
    id: productId,
    name: "XY Booster Box",
    setName: "XY Base Set",
    productFamily: "booster_box",
    variant: "Normal",
    currency: "USD",
    price: 150,
    priceSnapshots: { "1d": 145, "7d": 140, "30d": 125 },
    marketplaceUrls: {
      tcgplayer: "https://www.tcgplayer.com/product/123",
    },
    pricing: {
      tcgplayer: {
        price: 150,
        approxSaleCount: false,
        average1d: 150,
        average7d: 145,
        average30d: 140,
        high: 165,
        lastUpdated: "2026-10-05T00:00:00.000Z",
        low: 135,
        median3d: null,
        median7d: null,
        median30d: null,
        saleCount: 12,
      },
      ebay: {
        price: 142,
        approxSaleCount: true,
        average1d: 142,
        average7d: 140,
        average30d: 138,
        high: 155,
        lastUpdated: "2026-10-05T00:00:00.000Z",
        low: 130,
        median3d: null,
        median7d: null,
        median30d: null,
        saleCount: 8,
      },
    },
    refs: { cardmarketId: null, tcgplayerId: "123" },
  });

  render(
    <MemoryRouter initialEntries={[`/sealed/${productId}`]}>
      <Routes>
        <Route element={<SealedDetails />} path="/sealed/:id" />
      </Routes>
    </MemoryRouter>,
  );

  const heading = await screen.findByRole("heading", {
    name: "XY Booster Box",
  });
  expect(heading.closest(".details-page")).toHaveClass("sealed-details");
  expect(
    screen.getByRole("navigation", { name: "Breadcrumb" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "XY Base Set" })).toHaveAttribute(
    "href",
    "/sealed?set=XY%20Base%20Set",
  );
  expect(fetchSealedProduct).toHaveBeenCalledWith(
    productId,
    expect.any(AbortSignal),
  );
  await waitFor(() => {
    expect(fetchSealedMarketPriceHistory).toHaveBeenCalledWith(
      productId,
      expect.any(AbortSignal),
    );
  });
  expect(screen.getAllByText("Unopened")).toHaveLength(2);
  expect(screen.getByText("Unopened · 90 days")).toBeInTheDocument();
  expect(screen.getByText("$150.00")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "eBay" })).toBeInTheDocument();
  expect(screen.getByText("$142.00")).toBeInTheDocument();
  expect(screen.getByText("8+")).toBeInTheDocument();
  expect(screen.getByText("12")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /tcgplayer/i })).toHaveAttribute(
    "href",
    "https://www.tcgplayer.com/product/123",
  );
});
