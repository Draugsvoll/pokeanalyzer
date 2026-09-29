import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import type {
  MarketPriceHistoryPoint,
  MarketPriceHistoryResponse,
} from "../../../services/cardApi";
import {
  MarketPriceHistoryChart,
  MarketPriceHistoryLoading,
} from "./MarketPriceHistoryChart";

function point(
  date: string,
  avg: number,
  median7d: number | null = null,
): MarketPriceHistoryPoint {
  return {
    date,
    avg,
    median7d,
    median30d: null,
    low: null,
    high: null,
    saleCount: null,
    approxSaleCount: null,
  };
}

function history(
  series: MarketPriceHistoryResponse["series"],
): MarketPriceHistoryResponse {
  return {
    cardId: "card-1",
    condition: "NEAR_MINT",
    currency: "USD",
    fetchedAt: "2026-09-19T12:00:00.000Z",
    period: "90d",
    series,
    stale: false,
  };
}

test("renders available TCGPlayer and eBay history together", () => {
  render(
    <MarketPriceHistoryChart
      history={history({
        tcgplayer: [point("2026-09-17", 400), point("2026-09-18", 420)],
        ebay: [point("2026-09-17", 490, 480), point("2026-09-18", 500, 485)],
      })}
    />,
  );

  expect(
    screen.getByRole("group", { name: "Price history sources" }),
  ).toBeVisible();
  expect(screen.getByRole("heading", { name: "Price history" })).toBeVisible();
  expect(screen.getByText("TCGPlayer")).toBeVisible();
  expect(screen.getByText("eBay")).toBeVisible();
  expect(screen.getByRole("img")).toHaveAttribute(
    "aria-label",
    "TCGPlayer and eBay Near Mint price history from Sep 17 to Sep 18",
  );
  expect(
    document.querySelectorAll(".poketrace-market__history-line"),
  ).toHaveLength(2);
});

test("aligns mismatched dates and keeps a one-point series visible", () => {
  render(
    <MarketPriceHistoryChart
      history={history({
        tcgplayer: [point("2026-09-16", 400)],
        ebay: [point("2026-09-17", 490, 480), point("2026-09-18", 500, 485)],
      })}
    />,
  );

  expect(screen.getByRole("img")).toHaveAttribute(
    "aria-label",
    "TCGPlayer and eBay Near Mint price history from Sep 16 to Sep 18",
  );
  expect(
    document.querySelector(
      ".poketrace-market__history-series-marker--tcgplayer",
    ),
  ).toBeVisible();
});

test("renders normally when only one marketplace is available", () => {
  render(
    <MarketPriceHistoryChart
      history={history({
        tcgplayer: [point("2026-09-17", 400), point("2026-09-18", 420)],
      })}
    />,
  );

  expect(screen.getByText("TCGPlayer")).toBeVisible();
  expect(screen.queryByText("eBay")).not.toBeInTheDocument();
  expect(screen.getByRole("img")).toHaveAttribute(
    "aria-label",
    "TCGPlayer Near Mint price history from Sep 17 to Sep 18",
  );
  expect(
    document.querySelectorAll(".poketrace-market__history-line"),
  ).toHaveLength(1);
});

test("shows both marketplace values in the hover tooltip", () => {
  render(
    <MarketPriceHistoryChart
      history={history({
        tcgplayer: [point("2026-09-17", 400), point("2026-09-18", 420)],
        ebay: [point("2026-09-17", 490, 480), point("2026-09-18", 500, 485)],
      })}
    />,
  );

  const chart = screen.getByRole("img");
  chart.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
  fireEvent.pointerMove(chart, { clientX: 790 });

  expect(screen.getByText("$420")).toBeVisible();
  expect(screen.getByText("$485")).toBeVisible();
  expect(screen.getAllByText("Sep 18")).toHaveLength(2);
});

test("carries the latest eBay price through missing and trailing dates", () => {
  render(
    <MarketPriceHistoryChart
      history={history({
        tcgplayer: [point("2026-09-17", 400), point("2026-09-18", 420)],
        ebay: [point("2026-09-17", 490, 480)],
      })}
    />,
  );

  const chart = screen.getByRole("img");
  chart.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
  fireEvent.pointerMove(chart, { clientX: 790 });

  expect(screen.getByText("$420")).toBeVisible();
  expect(screen.getByText("$480")).toBeVisible();
  expect(
    document.querySelector(".poketrace-market__history-line--ebay"),
  ).toHaveAttribute("d", expect.stringContaining("L 790.00"));
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
