import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { NewsFeedsResponse } from "../../types/news";
import { NewsLane } from "./Newslane";

const mocks = vi.hoisted(() => ({
  cacheNewsFeeds: vi.fn(),
  fetchNewsFeeds: vi.fn(),
  readCachedNewsFeeds: vi.fn(),
}));

vi.mock("../../services/newsApi", () => mocks);

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
  biggestMovers: null,
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
  biggestMovers: null,
};

beforeEach(() => {
  mocks.cacheNewsFeeds.mockReset();
  mocks.fetchNewsFeeds.mockReset();
  mocks.readCachedNewsFeeds.mockReset();
  mocks.readCachedNewsFeeds.mockReturnValue(null);
});

test("uses a cache younger than 24 hours without fetching", () => {
  mocks.readCachedNewsFeeds.mockReturnValue({
    feeds: cachedFeeds,
    isFresh: true,
  });

  render(<NewsLane />);

  expect(screen.getByText("Cached market news")).toBeInTheDocument();
  expect(mocks.fetchNewsFeeds).not.toHaveBeenCalled();
});

test("renders stale cached news while refreshing it", async () => {
  mocks.readCachedNewsFeeds.mockReturnValue({
    feeds: cachedFeeds,
    isFresh: false,
  });
  mocks.fetchNewsFeeds.mockResolvedValue(freshFeeds);

  render(<NewsLane />);

  expect(screen.getByText("Cached market news")).toBeInTheDocument();
  expect(await screen.findByText("Fresh market news")).toBeInTheDocument();
  expect(mocks.cacheNewsFeeds).toHaveBeenCalledWith(freshFeeds);
});

test("retries once when the first news request fails", async () => {
  mocks.fetchNewsFeeds
    .mockRejectedValueOnce(new Error("Temporary failure"))
    .mockResolvedValueOnce(freshFeeds);

  render(<NewsLane />);

  expect(await screen.findByText("Fresh market news")).toBeInTheDocument();
  await waitFor(() => expect(mocks.fetchNewsFeeds).toHaveBeenCalledTimes(2));
});
