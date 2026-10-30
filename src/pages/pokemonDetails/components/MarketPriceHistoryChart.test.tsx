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

test("renders available TCGPlayer and Ebay history together", () => {
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
  expect(screen.getByText("Ebay")).toBeVisible();
  expect(screen.getByRole("img")).toHaveAttribute(
    "aria-label",
    "TCGPlayer and Ebay Near Mint price history from Sep 17 to Sep 18",
  );
  expect(
    document.querySelectorAll(".poketrace-market__history-line"),
  ).toHaveLength(2);
  expect(
    document.querySelectorAll(".poketrace-market__history-area"),
  ).toHaveLength(2);
  expect(
    document.querySelector(".poketrace-market__history-line--tcgplayer"),
  ).toHaveAttribute("d", expect.stringContaining("C "));
  expect(
    document.querySelector('[id^="market-history-glow-"]'),
  ).toHaveAttribute("filterUnits", "userSpaceOnUse");
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
    "TCGPlayer and Ebay Near Mint price history from Sep 16 to Sep 18",
  );
  expect(
    document.querySelector(
      ".poketrace-market__history-series-marker--tcgplayer",
    ),
  ).toBeVisible();
  expect(
    document.querySelector(".poketrace-market__history-line--tcgplayer"),
  ).toHaveAttribute("d", expect.stringContaining("L 790.00"));

  const chart = screen.getByRole("img");
  chart.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
  fireEvent.pointerMove(chart, { clientX: 790 });
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--tcgplayer strong",
    ),
  ).toHaveTextContent("$400");
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
  expect(screen.queryByText("Ebay")).not.toBeInTheDocument();
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

  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--tcgplayer strong",
    ),
  ).toHaveTextContent("$420");
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--ebay strong",
    ),
  ).toHaveTextContent("$500");
  expect(screen.getAllByText("Sep 18")).toHaveLength(2);
});

test("carries the latest Ebay price through trailing dates", () => {
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
  expect(screen.getByText("$490")).toBeVisible();
  expect(
    document.querySelector(".poketrace-market__history-point--ebay"),
  ).toBeInTheDocument();
  expect(
    document.querySelector(".poketrace-market__history-line--ebay"),
  ).toHaveAttribute("d", expect.stringContaining("L 790.00"));
});

test("aligns the Ebay line and marker on a carried-forward date", () => {
  render(
    <MarketPriceHistoryChart
      history={history({
        tcgplayer: [
          point("2026-09-10", 33),
          point("2026-09-11", 33),
          point("2026-09-12", 33),
        ],
        ebay: [point("2026-09-10", 40, 35), point("2026-09-12", 20, 25)],
      })}
    />,
  );
  const chart = screen.getByRole("img");
  chart.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
  fireEvent.pointerMove(chart, { clientX: 418 });
  expect(screen.getByText("$40.00")).toBeVisible();
  expect(
    document.querySelector(".poketrace-market__history-point--ebay"),
  ).toBeInTheDocument();

  const marker = document.querySelector(
    ".poketrace-market__history-point--ebay",
  )!;
  const coordinates = `${Number(marker.getAttribute("cx")).toFixed(2)} ${Number(marker.getAttribute("cy")).toFixed(2)}`;
  expect(
    document.querySelector(".poketrace-market__history-line--ebay"),
  ).toHaveAttribute("d", expect.stringContaining(coordinates));
});

test("stops the Ebay line at the price update date", () => {
  render(
    <MarketPriceHistoryChart
      ebayUpdatedOn="2026-09-17"
      history={history({
        tcgplayer: [point("2026-09-17", 400), point("2026-09-18", 420)],
        ebay: [point("2026-09-17", 29.04), point("2026-09-18", 55)],
      })}
    />,
  );

  const chart = screen.getByRole("img");
  chart.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
  fireEvent.pointerMove(chart, { clientX: 790 });

  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--ebay strong",
    ),
  ).toHaveTextContent("No data");
  expect(screen.queryByText("$55.00")).not.toBeInTheDocument();
  expect(
    document.querySelector(".poketrace-market__history-line--ebay"),
  ).not.toHaveAttribute("d", expect.stringContaining("L 790.00"));
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
