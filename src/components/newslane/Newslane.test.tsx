import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { MarketSummaryPayload, NewsFeedsResponse } from "../../types/news";
import { NewsLane } from "./Newslane";

const newsMocks = vi.hoisted(() => ({
  cacheNewsFeeds: vi.fn(),
  fetchNewsFeeds: vi.fn(),
  readCachedNewsFeeds: vi.fn(),
}));

const summaryMocks = vi.hoisted(() => ({
  cacheMarketSummary: vi.fn(),
  fetchMarketSummary: vi.fn(),
  readCachedMarketSummary: vi.fn(),
}));

vi.mock("../../services/newsApi", () => newsMocks);
vi.mock("../../services/marketSummaryApi", () => summaryMocks);

const cachedFeeds: NewsFeedsResponse = {
  generalNews: {
    date: "2026-09-18",
    items: [
      {
        action: [],
        headline: "Cached market news",
        label: "market",
        summary: "Previously saved news remains available.",
        url: "",
      },
    ],
  },
};

const freshFeeds: NewsFeedsResponse = {
  generalNews: {
    date: "2026-09-19",
    items: [
      {
        action: [],
        headline: "Fresh market news",
        label: "market",
        summary: "The retry loaded the latest stored news.",
        url: "",
      },
    ],
  },
};

const marketSummary: MarketSummaryPayload = {
  generatedAt: "2026-09-30T12:00:00.000Z",
  marketTone: {
    headline: "The market was mixed",
    label: "mixed",
  },
  marketOverview: ["Demand varied across product segments."],
  keyThemesAndChanges: [],
  liquidity: [],
  marketDrivers: [],
  segmentSummary: [],
  collectorOutlook: null,
  whatToWatch: [],
};

beforeEach(() => {
  newsMocks.cacheNewsFeeds.mockReset();
  newsMocks.fetchNewsFeeds.mockReset().mockResolvedValue({
    generalNews: null,
  });
  newsMocks.readCachedNewsFeeds.mockReset().mockReturnValue(null);
  summaryMocks.cacheMarketSummary.mockReset();
  summaryMocks.fetchMarketSummary.mockReset().mockResolvedValue(null);
  summaryMocks.readCachedMarketSummary.mockReset().mockReturnValue(null);
});

test("uses fresh caches without refetching either resource", () => {
  newsMocks.readCachedNewsFeeds.mockReturnValue({
    feeds: cachedFeeds,
    isFresh: true,
  });
  summaryMocks.readCachedMarketSummary.mockReturnValue({
    marketSummary,
    isFresh: true,
  });

  render(<NewsLane />);

  expect(screen.getByText("Cached market news")).toBeInTheDocument();
  expect(screen.getByText("The market was mixed")).toBeInTheDocument();
  expect(newsMocks.fetchNewsFeeds).not.toHaveBeenCalled();
  expect(summaryMocks.fetchMarketSummary).not.toHaveBeenCalled();
});

test("renders stale cached news while refreshing it", async () => {
  newsMocks.readCachedNewsFeeds.mockReturnValue({
    feeds: cachedFeeds,
    isFresh: false,
  });
  newsMocks.fetchNewsFeeds.mockResolvedValue(freshFeeds);

  render(<NewsLane />);

  expect(screen.getByText("Cached market news")).toBeInTheDocument();
  expect(await screen.findByText("Fresh market news")).toBeInTheDocument();
  expect(newsMocks.cacheNewsFeeds).toHaveBeenCalledWith(freshFeeds);
});

test("retries once when the news request fails", async () => {
  newsMocks.fetchNewsFeeds
    .mockRejectedValueOnce(new Error("Temporary failure"))
    .mockResolvedValueOnce(freshFeeds);

  render(<NewsLane />);

  expect(await screen.findByText("Fresh market news")).toBeInTheDocument();
  await waitFor(() =>
    expect(newsMocks.fetchNewsFeeds).toHaveBeenCalledTimes(2),
  );
});

test("loads a market summary independently from market news", async () => {
  summaryMocks.fetchMarketSummary.mockResolvedValue(marketSummary);

  render(<NewsLane />);

  expect(
    await screen.findByRole("heading", { name: "Weekly Market Recap" }),
  ).toBeVisible();
  expect(screen.getByText("The market was mixed")).toBeVisible();
  expect(summaryMocks.cacheMarketSummary).toHaveBeenCalledWith(marketSummary);
});

test("a fresh news cache does not suppress the summary request", async () => {
  newsMocks.readCachedNewsFeeds.mockReturnValue({
    feeds: cachedFeeds,
    isFresh: true,
  });
  summaryMocks.fetchMarketSummary.mockResolvedValue(marketSummary);

  render(<NewsLane />);

  expect(await screen.findByText("The market was mixed")).toBeVisible();
  expect(newsMocks.fetchNewsFeeds).not.toHaveBeenCalled();
  expect(summaryMocks.fetchMarketSummary).toHaveBeenCalledTimes(1);
});

test("skips market summary when its request fails", async () => {
  newsMocks.fetchNewsFeeds.mockResolvedValue(freshFeeds);
  summaryMocks.fetchMarketSummary.mockRejectedValue(
    new Error("Market summary unavailable"),
  );

  render(<NewsLane />);

  expect(await screen.findByText("Fresh market news")).toBeVisible();
  await waitFor(() =>
    expect(summaryMocks.fetchMarketSummary).toHaveBeenCalledTimes(2),
  );
  expect(screen.queryByRole("region", { name: "Market summary" })).toBeNull();
});

test("skips market summary when the API has no stored summary", async () => {
  newsMocks.fetchNewsFeeds.mockResolvedValue(freshFeeds);
  summaryMocks.fetchMarketSummary.mockResolvedValue(null);

  render(<NewsLane />);

  expect(await screen.findByText("Fresh market news")).toBeVisible();
  await waitFor(() =>
    expect(summaryMocks.fetchMarketSummary).toHaveBeenCalledTimes(2),
  );
  expect(screen.queryByRole("region", { name: "Market summary" })).toBeNull();
});
