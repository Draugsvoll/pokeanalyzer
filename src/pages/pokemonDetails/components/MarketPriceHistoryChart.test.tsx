import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import {
  MarketPriceHistoryChart,
  MarketPriceHistoryLoading,
} from "./MarketPriceHistoryChart";

test("switches between available TCGPlayer and eBay history", () => {
  render(
    <MarketPriceHistoryChart
      history={{
        cardId: "card-1",
        condition: "NEAR_MINT",
        currency: "USD",
        fetchedAt: "2026-09-19T12:00:00.000Z",
        period: "90d",
        series: {
          tcgplayer: [
            {
              date: "2026-09-17",
              avg: 400,
              median7d: null,
              median30d: null,
              low: null,
              high: null,
              saleCount: null,
              approxSaleCount: null,
            },
            {
              date: "2026-09-18",
              avg: 420,
              median7d: null,
              median30d: null,
              low: null,
              high: null,
              saleCount: null,
              approxSaleCount: null,
            },
          ],
          ebay: [
            {
              date: "2026-09-17",
              avg: 490,
              median7d: 480,
              median30d: 470,
              low: null,
              high: null,
              saleCount: null,
              approxSaleCount: null,
            },
            {
              date: "2026-09-18",
              avg: 500,
              median7d: 485,
              median30d: 475,
              low: null,
              high: null,
              saleCount: null,
              approxSaleCount: null,
            },
          ],
        },
        stale: false,
      }}
    />,
  );

  expect(
    screen.getByRole("radiogroup", { name: "Price history source" }),
  ).toBeVisible();
  expect(screen.getByRole("heading", { name: "Price history" })).toBeVisible();
  expect(screen.queryByText("Near Mint · 90 days")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("radio", { name: "eBay" }));

  expect(screen.queryByText("Near Mint · 90 days")).not.toBeInTheDocument();
  expect(screen.getByRole("img")).toHaveAttribute(
    "aria-label",
    "eBay Near Mint price history from Sep 17 to Sep 18",
  );
});

test("shows only a subtle indicator while history loads", () => {
  render(<MarketPriceHistoryLoading />);

  const loading = screen.getByRole("status", {
    name: "Loading marketplace price history",
  });
  expect(loading).toBeVisible();
  expect(loading.querySelector(".app-loading-spinner")).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
