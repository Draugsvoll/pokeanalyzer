import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { MarketPriceHistoryResponse } from "../../../services/cardApi";
import demoCard from "../../../../public/demo-card.json";
import type { PokemonCard } from "../../../types/pokemon";
import {
  fetchCardPriceHistory,
  fetchMarketPriceHistory,
} from "../../../services/cardApi";
import { PokeTraceMarketPrices } from "./PokeTraceMarketPrices";

vi.mock("../../../services/cardApi", () => ({
  fetchCardPriceHistory: vi.fn(),
  fetchMarketPriceHistory: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

test("uses normal prices and live history even when embedded demo snapshots are present", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  vi.mocked(fetchMarketPriceHistory).mockResolvedValue(history("NEAR_MINT"));
  const { container } = render(
    <PokeTraceMarketPrices
      hasMarketHistoryAccess
      cardId={cardId}
      data={
        {
          ...demoCard.pokeTrace,
          marketPriceHistory: history("NEAR_MINT"),
        } as PokemonCard["pokeTrace"]
      }
    />,
  );
  await waitFor(() =>
    expect(fetchMarketPriceHistory).toHaveBeenCalledWith(
      cardId,
      expect.any(AbortSignal),
      "NEAR_MINT",
      "US",
    ),
  );
  expect(fetchCardPriceHistory).toHaveBeenCalledWith(
    cardId,
    9,
    expect.any(AbortSignal),
  );
  const headlines = container.querySelectorAll(
    ".poketrace-market__price-summary > strong",
  );
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });
  expect(headlines[0]).toHaveTextContent(
    money.format(demoCard.pokeTrace.prices.tcgplayer.NEAR_MINT.avg),
  );
  expect(headlines[1]).toHaveTextContent(
    money.format(demoCard.pokeTrace.prices.ebay.NEAR_MINT.avg),
  );
});

const cardId = "019bff77-befa-771d-bab0-f5909f0a78c9";
const liveData: NonNullable<PokemonCard["pokeTrace"]> = {
  currency: "USD",
  marketplaceUrls: {},
  gradedOptions: ["PSA_8", "PSA_9", "BGS_9", "BGS_9_5"],
  prices: {
    tcgplayer: { NEAR_MINT: { avg: 20 } },
    ebay: {
      NEAR_MINT: { avg: 25 },
      LIGHTLY_PLAYED: { avg: 20 },
      MODERATELY_PLAYED: { avg: 15 },
      HEAVILY_PLAYED: { avg: 10 },
      DAMAGED: { avg: 5 },
      PSA_8: { avg: 500, saleCount: 15, lastUpdated: "2026-11-04T00:00:00Z" },
      PSA_9: { avg: 300, saleCount: 14, lastUpdated: "2026-11-04T00:00:00Z" },
      BGS_9: { avg: 400, saleCount: 20, lastUpdated: "2026-11-04T00:00:00Z" },
      BGS_9_5: { avg: 450, saleCount: 25, lastUpdated: "2026-11-04T00:00:00Z" },
      CGC_10: { avg: 500, saleCount: 30, lastUpdated: "2026-11-04T00:00:00Z" },
      FAKE_10: { avg: 500, saleCount: 30, lastUpdated: "2026-11-04T00:00:00Z" },
    },
  },
};

liveData.markets = {
  US: { available: true, cardId, currency: "USD" },
  EU: { available: true, cardId: "eu_1", currency: "EUR" },
};
liveData.marketPrices = Object.fromEntries(
  Object.entries(
    liveData.prices.ebay as Record<string, Record<string, unknown>>,
  ).map(([tier, price]) => [tier, { US: { ebay: price } }]),
);

test("shows Cardmarket as the third market card with EU aggregated prices", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  const { container } = render(
    <PokeTraceMarketPrices
      cardId={cardId}
      data={{
        ...liveData,
        marketplaceUrls: { cardmarket: "https://www.cardmarket.com/" },
        marketPrices: {
          AGGREGATED: {
            EU: {
              cardmarket: { avg: 18, low: 15, avg7d: 17, avg30d: 16 },
            },
          },
        },
      }}
    />,
  );
  const cards = container.querySelectorAll(".poketrace-market__marketplace");
  expect(cards).toHaveLength(3);
  expect(
    within(cards[0] as HTMLElement).getByText("$20.00"),
  ).toBeInTheDocument();
  expect(
    within(cards[1] as HTMLElement).getByText("$25.00"),
  ).toBeInTheDocument();
  const cardmarket = within(cards[2] as HTMLElement);
  expect(
    within(
      cardmarket.getByRole("heading", { name: "View on Cardmarket" }),
    ).getByRole("link", { name: "View on Cardmarket" }),
  ).toHaveTextContent("Cardmarket");
  expect(cardmarket.getAllByText("€18.00")).toHaveLength(2);
  expect(cardmarket.getByText("Listings")).toBeInTheDocument();
  expect(cardmarket.getByText("From")).toBeInTheDocument();
  expect(cardmarket.queryByText("7d avg")).not.toBeInTheDocument();
  expect(cardmarket.getByText("Trend")).toBeInTheDocument();
  expect(cardmarket.getByText("30d avg")).toBeInTheDocument();
  expect(cardmarket.getByText("€15.00")).toBeInTheDocument();
  expect(cardmarket.queryByText("€17.00")).not.toBeInTheDocument();
  expect(cardmarket.getByText("€16.00")).toBeInTheDocument();
  expect(cardmarket.queryByRole("radiogroup")).not.toBeInTheDocument();
  expect(
    cardmarket.getByRole("link", { name: "View on Cardmarket" }),
  ).toHaveAttribute("href", "https://www.cardmarket.com/");
  await waitFor(() => expect(fetchCardPriceHistory).toHaveBeenCalled());
});

test.each([
  [
    "eu_275225",
    "https://www.cardmarket.com/en/Pokemon/Products?idProduct=275225",
  ],
  ["eu_invalid", null],
])(
  "builds a Cardmarket link only from a numeric EU product ID: %s",
  async (euId, expectedUrl) => {
    vi.mocked(fetchCardPriceHistory).mockResolvedValue({
      cardId,
      days: 9,
      snapshots: [],
    });
    render(
      <PokeTraceMarketPrices
        cardId={cardId}
        data={{
          ...liveData,
          markets: {
            ...liveData.markets,
            EU: { available: true, cardId: euId, currency: "EUR" },
          },
          marketPrices: { AGGREGATED: { EU: { cardmarket: { avg: 18 } } } },
        }}
      />,
    );
    const link = screen.queryByRole("link", { name: "View on Cardmarket" });
    if (expectedUrl) expect(link).toHaveAttribute("href", expectedUrl);
    else expect(link).not.toBeInTheDocument();
    await waitFor(() => expect(fetchCardPriceHistory).toHaveBeenCalled());
  },
);

test.each([
  ["NEAR_MINT", "Near Mint"],
  ["LIGHTLY_PLAYED", "Lightly Played"],
] as const)(
  "offers only available EU raw conditions and selects %s",
  async (tier, label) => {
    vi.mocked(fetchCardPriceHistory).mockResolvedValue({
      cardId,
      days: 9,
      snapshots: [],
    });
    vi.mocked(fetchMarketPriceHistory).mockImplementation(
      async (_id, _signal, requested = "NEAR_MINT", market = "US") => ({
        ...history(requested),
        market,
        currency: market === "EU" ? "EUR" : "USD",
      }),
    );
    render(
      <PokeTraceMarketPrices
        hasMarketHistoryAccess
        cardId={cardId}
        data={{
          ...liveData,
          marketPrices: {
            ...liveData.marketPrices,
            [tier]: {
              US: { ebay: { avg: 25 } },
              EU: { cardmarket_unsold: { avg: 20 } },
            },
            DAMAGED: { EU: { cardmarket_unsold: { avg: null } } },
          },
        }}
      />,
    );
    await screen.findByRole("img");
    fireEvent.click(screen.getByRole("radio", { name: "EU" }));
    await waitFor(() =>
      expect(fetchMarketPriceHistory).toHaveBeenLastCalledWith(
        cardId,
        expect.any(AbortSignal),
        tier,
        "EU",
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Price history condition or grade" }),
    );
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual([label]);
  },
);

test("does not fetch an unavailable EU condition when there are no qualifying tiers", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  vi.mocked(fetchMarketPriceHistory).mockImplementation(
    async (_id, _signal, tier = "NEAR_MINT") => history(tier),
  );
  render(
    <PokeTraceMarketPrices
      hasMarketHistoryAccess
      cardId={cardId}
      data={liveData}
    />,
  );
  await screen.findByRole("img");
  const requests = vi.mocked(fetchMarketPriceHistory).mock.calls.length;
  fireEvent.click(screen.getByRole("radio", { name: "EU" }));
  expect(screen.getByText("No available conditions")).toBeInTheDocument();
  expect(screen.getByText("No price history")).toBeInTheDocument();
  expect(fetchMarketPriceHistory).toHaveBeenCalledTimes(requests);
});

test("waits for membership access before showing locked content or fetching history", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  vi.mocked(fetchMarketPriceHistory).mockResolvedValue(history("NEAR_MINT"));
  const { rerender } = render(
    <PokeTraceMarketPrices
      cardId={cardId}
      data={liveData}
      marketHistoryAccessPending
    />,
  );
  expect(
    screen.queryByText("Available with Basic or Pro membership."),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("status", { name: "Loading marketplace price history" }),
  ).toBeInTheDocument();
  expect(fetchMarketPriceHistory).not.toHaveBeenCalled();
  rerender(
    <PokeTraceMarketPrices
      cardId={cardId}
      data={liveData}
      hasMarketHistoryAccess
    />,
  );
  await screen.findByRole("img");
  expect(
    screen.queryByText("Available with Basic or Pro membership."),
  ).not.toBeInTheDocument();
  rerender(<PokeTraceMarketPrices cardId={cardId} data={liveData} />);
  expect(
    screen.getAllByText("Available with Basic or Pro membership."),
  ).toHaveLength(2);
});

function history(
  tier: MarketPriceHistoryResponse["condition"],
): MarketPriceHistoryResponse {
  return {
    cardId,
    condition: tier,
    currency: "USD",
    period: "1y",
    fetchedAt: "2026-11-04T12:00:00Z",
    stale: false,
    market: "US",
    series: {
      ebay: [
        {
          date: new Date().toISOString().slice(0, 10),
          avg: 500,
          median7d: 450,
          median30d: null,
          low: null,
          high: null,
          saleCount: 2,
          approxSaleCount: null,
        },
      ],
    },
  };
}

function nativeData(data: PokemonCard["pokeTrace"]) {
  return {
    ...data,
    marketPrices: Object.fromEntries(
      Object.entries(
        (data.prices.ebay as Record<string, Record<string, unknown>>) ?? {},
      ).map(([tier, price]) => [tier, { US: { ebay: price } }]),
    ),
  };
}

function selectTier(label: string) {
  fireEvent.click(
    screen.getByRole("button", { name: "Price history condition or grade" }),
  );
  fireEvent.click(screen.getByRole("option", { name: label }));
}

test.each([true, false])(
  "selects PSA 10 on opening only when it qualifies (available: %s)",
  async (available) => {
    vi.mocked(fetchCardPriceHistory).mockResolvedValue({
      cardId,
      days: 9,
      snapshots: [],
    });
    vi.mocked(fetchMarketPriceHistory).mockImplementation(
      async (_id, _signal, tier = "NEAR_MINT") => history(tier),
    );
    const data = nativeData({
      ...liveData,
      gradedOptions: ["PSA_10"],
      prices: {
        ...liveData.prices,
        ebay: {
          NEAR_MINT: { avg: 25 },
          PSA_10: {
            avg: 500,
            saleCount: available ? 15 : 14,
            lastUpdated: "2026-11-04T00:00:00Z",
          },
        },
      },
    });
    const { rerender } = render(
      <PokeTraceMarketPrices
        hasMarketHistoryAccess
        cardId={cardId}
        data={{ ...data, marketPrices: {}, gradedOptions: [] }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Price history condition or grade" }),
    ).toHaveTextContent("Near Mint");
    rerender(
      <PokeTraceMarketPrices
        hasMarketHistoryAccess
        cardId={cardId}
        data={data}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Price history condition or grade" }),
    ).toHaveTextContent(available ? "PSA 10" : "Near Mint");
    await screen.findByRole("img");
    expect(fetchMarketPriceHistory).toHaveBeenCalledWith(
      cardId,
      expect.any(AbortSignal),
      available ? "PSA_10" : "NEAR_MINT",
      "US",
    );
    if (available) selectTier("Near Mint");
    rerender(
      <PokeTraceMarketPrices
        hasMarketHistoryAccess
        cardId={cardId}
        data={{ ...data }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Price history condition or grade" }),
    ).toHaveTextContent("Near Mint");
  },
);

test("switches markets without mixing prices, grades, currency, or cached responses", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  vi.mocked(fetchMarketPriceHistory).mockImplementation(
    async (_id, _signal, tier = "NEAR_MINT", market = "US") => {
      const result = history(tier);
      if (market === "EU") {
        return {
          ...result,
          market,
          currency: "EUR",
          series: {
            cardmarket_unsold: [
              {
                ...result.series.ebay![0],
                avg: tier === "NEAR_MINT" ? 22 : 200,
              },
            ],
          },
        };
      }
      return result;
    },
  );
  const data = {
    ...liveData,
    marketPrices: {
      ...liveData.marketPrices,
      NEAR_MINT: {
        US: { ebay: { avg: 25 } },
        EU: { cardmarket_unsold: { avg: 22 } },
      },
      PSA_9: {
        EU: {
          cardmarket_unsold: {
            avg: 200,
            saleCount: 20,
            lastUpdated: "2026-11-04T00:00:00Z",
          },
        },
      },
    },
  };
  render(
    <PokeTraceMarketPrices
      cardId={cardId}
      data={data}
      hasMarketHistoryAccess
    />,
  );
  await screen.findByRole("img");
  fireEvent.click(screen.getByRole("radio", { name: "EU" }));
  await screen.findByRole("img", { name: /CardMarket Near Mint/ });
  expect(
    screen.getByRole("group", { name: "Price history sources" }),
  ).toHaveTextContent("2 listings");
  selectTier("PSA 9");
  await screen.findByRole("img", { name: /CardMarket and PSA 9 Near Mint/ });
  const count = vi.mocked(fetchMarketPriceHistory).mock.calls.length;
  fireEvent.click(screen.getByRole("radio", { name: "US" }));
  await screen.findByRole("img", { name: /Ebay Near Mint/ });
  expect(fetchMarketPriceHistory).toHaveBeenCalledTimes(count);
  expect(screen.getByText("$20.00")).toBeVisible();
});

test("hides Mint in marketplace tabs without treating it as a grade", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  vi.mocked(fetchMarketPriceHistory).mockResolvedValue(history("NEAR_MINT"));
  render(
    <PokeTraceMarketPrices
      hasMarketHistoryAccess
      cardId={cardId}
      data={{
        ...liveData,
        prices: {
          tcgplayer: { MINT: { avg: 40 }, NEAR_MINT: { avg: 25 } },
          ebay: {
            MINT: { avg: 38 },
            NEAR_MINT: { avg: 27 },
            LIGHTLY_PLAYED: { avg: 20 },
          },
        },
      }}
    />,
  );
  expect(
    within(screen.getByRole("radiogroup", { name: "TCGPlayer card condition" }))
      .getAllByRole("radio")
      .map((radio) => radio.getAttribute("value")),
  ).toEqual(["NEAR_MINT"]);
  expect(
    within(screen.getByRole("radiogroup", { name: "Ebay card condition" }))
      .getAllByRole("radio")
      .map((radio) => radio.getAttribute("value")),
  ).toEqual(["NEAR_MINT", "LIGHTLY_PLAYED"]);
  expect(
    within(screen.getByRole("region", { name: "Graded" })).queryByText("Mint"),
  ).not.toBeInTheDocument();
  await screen.findByRole("img");
});

test("hides grades with three identical numeric medians without hiding raw prices or incomplete medians", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  vi.mocked(fetchMarketPriceHistory).mockResolvedValue(history("NEAR_MINT"));
  const data: NonNullable<PokemonCard["pokeTrace"]> = {
    ...liveData,
    prices: {
      tcgplayer: {
        NEAR_MINT: { avg: 25, median3d: 25, median7d: 25, median30d: 25 },
      },
      ebay: {
        PSA_8: {
          saleCount: 15,
          avg: 2175,
          median3d: 2175,
          median7d: 2175,
          median30d: 2175,
        },
        PSA_9: {
          saleCount: 15,
          avg: 300,
          median3d: 200,
          median7d: 200,
          median30d: 220,
        },
        PSA_6: {
          saleCount: 15,
          avg: 100,
          median3d: null,
          median7d: 100,
          median30d: 100,
        },
        PSA_7: { saleCount: 15, avg: 50 },
        PSA_5: { saleCount: 14, avg: 25 },
        BGS_9: {
          saleCount: 15,
          avg: 400,
          median3d: 400,
          median7d: 400,
          median30d: 400,
        },
      },
    },
  };
  const { container } = render(
    <PokeTraceMarketPrices
      hasMarketHistoryAccess
      cardId={cardId}
      data={nativeData(data)}
    />,
  );
  const graded = within(screen.getByRole("region", { name: "Graded" }));
  expect(graded.queryByText("PSA 8")).not.toBeInTheDocument();
  expect(graded.getByText("PSA 9")).toBeVisible();
  expect(graded.getByText("PSA 6")).toBeVisible();
  expect(graded.getByText("PSA 7")).toBeVisible();
  expect(graded.queryByText("PSA 5")).not.toBeInTheDocument();
  expect(graded.queryByText("BGS")).not.toBeInTheDocument();
  expect(graded.getByTitle("3 graded prices")).toBeVisible();
  expect(
    container.querySelector(".poketrace-market__price-summary > strong"),
  ).toHaveTextContent("$25.00");
  await screen.findByRole("img");
});

test("graded prices prefer 30-day median, then 7-day median, then average", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  vi.mocked(fetchMarketPriceHistory).mockResolvedValue(history("NEAR_MINT"));
  render(
    <PokeTraceMarketPrices
      hasMarketHistoryAccess
      cardId={cardId}
      data={{
        ...liveData,
        prices: {
          tcgplayer: { NEAR_MINT: { avg: 20, median30d: 10 } },
          ebay: {
            PSA_8: { saleCount: 15, avg: 500, median7d: 450, median30d: 425 },
            PSA_9: { saleCount: 15, avg: 300, median7d: 250, median30d: null },
            PSA_6: { saleCount: 15, avg: 200, median7d: 150 },
            PSA_7: { saleCount: 15, avg: 200 },
          },
        },
      }}
    />,
  );
  const graded = within(screen.getByRole("region", { name: "Graded" }));
  expect(graded.getByText("$425.00")).toBeVisible();
  expect(graded.getByText("$250.00")).toBeVisible();
  expect(graded.getByText("$150.00")).toBeVisible();
  expect(graded.getByText("$200.00")).toBeVisible();
  expect(graded.queryByText("$450.00")).toBeNull();
  expect(graded.queryByText("$300.00")).toBeNull();
  expect(screen.getByText("$20.00")).toBeVisible();
  await screen.findByRole("img");
});

test("omits stale or undated graded options while retaining the two-month boundary and raw conditions", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  vi.mocked(fetchMarketPriceHistory).mockResolvedValue(history("NEAR_MINT"));
  const data: NonNullable<PokemonCard["pokeTrace"]> = {
    ...liveData,
    gradedOptions: ["PSA_8", "BGS_9", "PSA_5"],
    prices: {
      ebay: {
        NEAR_MINT: { avg: 25 },
        PSA_8: {
          avg: 500,
          saleCount: 100,
          lastUpdated: "2026-09-03T23:59:59Z",
        },
        BGS_9: { avg: 400, saleCount: 100 },
        PSA_5: { avg: 100, saleCount: 15, lastUpdated: "2026-09-04T00:00:00Z" },
      },
    },
  };
  render(
    <PokeTraceMarketPrices
      hasMarketHistoryAccess
      cardId={cardId}
      data={nativeData(data)}
    />,
  );
  await screen.findByRole("img");
  fireEvent.click(
    screen.getByRole("button", { name: "Price history condition or grade" }),
  );
  expect(
    screen.getAllByRole("option").map((option) => option.textContent),
  ).toEqual(["Near Mint", "PSA 5"]);
});

test("offers qualifying exact grades, fetches on selection, and reuses each tier's history", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  vi.mocked(fetchMarketPriceHistory).mockImplementation(
    async (_id, _signal, tier = "NEAR_MINT") => {
      const result = history(tier);
      if (tier === "NEAR_MINT") {
        result.series.ebay![0].avg = 25;
        result.series.tcgplayer = [{ ...result.series.ebay![0], avg: 20 }];
      }
      return result;
    },
  );
  const data: NonNullable<PokemonCard["pokeTrace"]> = {
    ...liveData,
    gradedOptions: [...liveData.gradedOptions!, "PSA_6"],
    prices: {
      ...liveData.prices,
      ebay: {
        ...(liveData.prices.ebay as Record<string, unknown>),
        PSA_6: { avg: 200, saleCount: 15, lastUpdated: "2026-11-04T00:00:00Z" },
      },
    },
  };
  render(
    <PokeTraceMarketPrices
      hasMarketHistoryAccess
      cardId={cardId}
      data={nativeData(data)}
    />,
  );
  await screen.findByRole("img", { name: /Ebay Near Mint price history/ });
  expect(fetchMarketPriceHistory).toHaveBeenCalledTimes(1);

  fireEvent.click(
    screen.getByRole("button", { name: "Price history condition or grade" }),
  );
  expect(
    screen.getAllByRole("option").map((option) => option.textContent),
  ).toEqual([
    "Near Mint",
    "Lightly Played",
    "Moderately Played",
    "Heavily Played",
    "Damaged",
    "BGS 9",
    "PSA 8",
    "PSA 6",
  ]);
  fireEvent.click(screen.getByRole("option", { name: "PSA 8" }));
  const chart = await screen.findByRole("img", {
    name: /TCGPlayer and Ebay and PSA 8 Near Mint price history/,
  });
  expect(fetchMarketPriceHistory).toHaveBeenLastCalledWith(
    cardId,
    expect.any(AbortSignal),
    "PSA_8",
    "US",
  );
  chart.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
  fireEvent.pointerMove(chart, { clientX: 790 });
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--graded strong",
    ),
  ).toHaveTextContent("$450");
  expect(
    document.querySelectorAll(".poketrace-market__history-line"),
  ).toHaveLength(3);
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--tcgplayer strong",
    ),
  ).toHaveTextContent("$20.00");
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--ebay strong",
    ),
  ).toHaveTextContent("$25.00");

  selectTier("BGS 9");
  await screen.findByRole("img", {
    name: /Ebay and BGS 9 Near Mint price history/,
  });
  selectTier("Near Mint");
  expect(
    screen.getByRole("img", { name: /Ebay Near Mint price history/ }),
  ).toBeVisible();
  expect(
    document.querySelector(".poketrace-market__history-line--graded"),
  ).not.toBeInTheDocument();
  selectTier("PSA 8");
  expect(
    screen.getByRole("img", {
      name: /Ebay and PSA 8 Near Mint price history/,
    }),
  ).toBeVisible();
  expect(fetchMarketPriceHistory).toHaveBeenCalledTimes(3);
});

test.each(["Lightly Played", "Moderately Played", "Heavily Played", "Damaged"])(
  "always compares grades with Near Mint after viewing %s",
  async (rawLabel) => {
    vi.mocked(fetchCardPriceHistory).mockResolvedValue({
      cardId,
      days: 9,
      snapshots: [],
    });
    vi.mocked(fetchMarketPriceHistory).mockImplementation(
      async (_id, _signal, tier = "NEAR_MINT") => {
        const result = history(tier);
        if (tier === "NEAR_MINT") {
          result.series.ebay![0].avg = 25;
          result.series.tcgplayer = [{ ...result.series.ebay![0], avg: 20 }];
        } else if (
          [
            "LIGHTLY_PLAYED",
            "MODERATELY_PLAYED",
            "HEAVILY_PLAYED",
            "DAMAGED",
          ].includes(tier)
        ) {
          result.series.ebay![0].avg = 3;
          result.series.tcgplayer = [{ ...result.series.ebay![0], avg: 2 }];
        }
        return result;
      },
    );
    render(
      <PokeTraceMarketPrices
        hasMarketHistoryAccess
        cardId={cardId}
        data={liveData}
      />,
    );
    await screen.findByRole("img", { name: /Near Mint/ });

    for (const grade of ["PSA 8", "BGS 9", "PSA 8"]) {
      selectTier(rawLabel);
      await screen.findByRole("img", { name: new RegExp(rawLabel) });
      selectTier(grade);
      const chart = await screen.findByRole("img", {
        name: new RegExp(
          `TCGPlayer and Ebay and ${grade} Near Mint price history`,
        ),
      });
      chart.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
      fireEvent.pointerMove(chart, { clientX: 790 });
      expect(
        document.querySelector(
          ".poketrace-market__history-tooltip-row--tcgplayer strong",
        ),
      ).toHaveTextContent("$20.00");
      expect(
        document.querySelector(
          ".poketrace-market__history-tooltip-row--ebay strong",
        ),
      ).toHaveTextContent("$25.00");
      expect(
        document.querySelector(
          ".poketrace-market__history-tooltip-row--graded strong",
        ),
      ).toHaveTextContent("$450");
    }
    expect(fetchMarketPriceHistory).toHaveBeenCalledTimes(4);
  },
);

test("loads Near Mint alongside a grade selected before the initial history finishes", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  let nearMintRequests = 0;
  vi.mocked(fetchMarketPriceHistory).mockImplementation(
    async (_id, _signal, tier = "NEAR_MINT") => {
      if (tier === "NEAR_MINT" && ++nearMintRequests === 1) {
        return new Promise(() => {});
      }
      const result = history(tier);
      if (tier === "NEAR_MINT") result.series.tcgplayer = result.series.ebay;
      return result;
    },
  );
  render(
    <PokeTraceMarketPrices
      hasMarketHistoryAccess
      cardId={cardId}
      data={liveData}
    />,
  );
  const initialSignal = vi.mocked(fetchMarketPriceHistory).mock.calls[0][1]!;
  selectTier("PSA 8");
  await screen.findByRole("img", { name: /TCGPlayer and Ebay and PSA 8/ });
  expect(initialSignal.aborted).toBe(true);
  expect(
    document.querySelectorAll(".poketrace-market__history-line"),
  ).toHaveLength(3);
  selectTier("Lightly Played");
  await screen.findByRole("img", { name: /Ebay Lightly Played/ });
  expect(
    document.querySelector(".poketrace-market__history-line--graded"),
  ).not.toBeInTheDocument();
  expect(
    document.querySelector(".poketrace-market__history-line--tcgplayer"),
  ).not.toBeInTheDocument();
});

test("fetches raw conditions without a graded sales threshold and displays both raw sources using averages", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  vi.mocked(fetchMarketPriceHistory).mockImplementation(
    async (_id, _signal, tier = "NEAR_MINT") => {
      const result = history(tier);
      return {
        ...result,
        series: { ...result.series, tcgplayer: result.series.ebay },
      };
    },
  );
  render(
    <PokeTraceMarketPrices
      hasMarketHistoryAccess
      cardId={cardId}
      data={liveData}
    />,
  );
  await screen.findByRole("img");
  selectTier("Lightly Played");
  const chart = await screen.findByRole("img", {
    name: /TCGPlayer and Ebay Lightly Played/,
  });
  expect(fetchMarketPriceHistory).toHaveBeenLastCalledWith(
    cardId,
    expect.any(AbortSignal),
    "LIGHTLY_PLAYED",
    "US",
  );
  chart.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
  fireEvent.pointerMove(chart, { clientX: 790 });
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--ebay strong",
    ),
  ).toHaveTextContent("$500");
  selectTier("Damaged");
  await screen.findByRole("img", { name: /TCGPlayer and Ebay Damaged/ });
  expect(fetchMarketPriceHistory).toHaveBeenLastCalledWith(
    cardId,
    expect.any(AbortSignal),
    "DAMAGED",
    "US",
  );
  selectTier("Lightly Played");
  expect(screen.getByRole("img", { name: /Lightly Played/ })).toBeVisible();
  expect(fetchMarketPriceHistory).toHaveBeenCalledTimes(3);
});

test("ignores a response from an abandoned grade and allows switching after an error", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  let resolvePsa!: (value: MarketPriceHistoryResponse) => void;
  vi.mocked(fetchMarketPriceHistory).mockImplementation(
    async (_id, _signal, tier = "NEAR_MINT") => {
      if (tier === "PSA_8")
        return new Promise((resolve) => {
          resolvePsa = resolve;
        });
      if (tier === "BGS_9") throw new Error("unavailable");
      return history(tier);
    },
  );
  render(
    <PokeTraceMarketPrices
      hasMarketHistoryAccess
      cardId={cardId}
      data={liveData}
    />,
  );
  await screen.findByRole("img");
  selectTier("PSA 8");
  const psaSignal = vi.mocked(fetchMarketPriceHistory).mock.calls.at(-1)![1]!;
  selectTier("BGS 9");
  expect(psaSignal.aborted).toBe(true);
  await waitFor(() =>
    expect(
      screen.queryByRole("status", {
        name: "Loading marketplace price history",
      }),
    ).not.toBeInTheDocument(),
  );
  await act(async () => {
    resolvePsa(history("PSA_8"));
  });
  expect(
    screen.getByRole("button", { name: "Price history condition or grade" }),
  ).toHaveTextContent("BGS 9");
  expect(screen.getByRole("img", { name: /Ebay Near Mint/ })).toBeVisible();
  expect(
    document.querySelector(".poketrace-market__history-line--graded"),
  ).not.toBeInTheDocument();
  selectTier("Near Mint");
  await waitFor(() =>
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Near Mint"),
    ),
  );
});

test.each([
  ["PSA_8", "PSA 8"],
  ["LIGHTLY_PLAYED", "Lightly Played"],
] as const)(
  "retries a failed %s request on reselection without an automatic retry loop",
  async (tier, label) => {
    vi.mocked(fetchCardPriceHistory).mockResolvedValue({
      cardId,
      days: 9,
      snapshots: [],
    });
    let attempts = 0;
    vi.mocked(fetchMarketPriceHistory).mockImplementation(
      async (_id, _signal, requested = "NEAR_MINT") => {
        if (requested === tier && ++attempts === 1)
          throw new Error("temporary failure");
        return history(requested);
      },
    );
    render(
      <PokeTraceMarketPrices
        hasMarketHistoryAccess
        cardId={cardId}
        data={liveData}
      />,
    );
    await screen.findByRole("img");
    selectTier(label);
    await waitFor(() =>
      expect(
        screen.queryByRole("status", {
          name: "Loading marketplace price history",
        }),
      ).not.toBeInTheDocument(),
    );
    expect(attempts).toBe(1);
    expect(fetchMarketPriceHistory).toHaveBeenCalledTimes(2);
    selectTier("Near Mint");
    selectTier(label);
    await screen.findByRole("img", { name: new RegExp(label) });
    expect(attempts).toBe(2);
    expect(fetchMarketPriceHistory).toHaveBeenCalledTimes(3);
    selectTier("Near Mint");
    selectTier(label);
    expect(fetchMarketPriceHistory).toHaveBeenCalledTimes(3);
  },
);

test("retries failed Near Mint comparison data when selecting a grade", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  let nearMintAttempts = 0;
  vi.mocked(fetchMarketPriceHistory).mockImplementation(
    async (_id, _signal, tier = "NEAR_MINT") => {
      if (tier === "NEAR_MINT" && ++nearMintAttempts === 1)
        throw new Error("temporary failure");
      const result = history(tier);
      if (tier === "NEAR_MINT") result.series.tcgplayer = result.series.ebay;
      return result;
    },
  );
  render(
    <PokeTraceMarketPrices
      hasMarketHistoryAccess
      cardId={cardId}
      data={liveData}
    />,
  );
  await screen.findByText("No price history");
  expect(fetchMarketPriceHistory).toHaveBeenCalledTimes(1);
  selectTier("PSA 8");
  await screen.findByRole("img", { name: /TCGPlayer and Ebay and PSA 8/ });
  expect(nearMintAttempts).toBe(2);
  expect(fetchMarketPriceHistory).toHaveBeenCalledTimes(3);
});

test("keeps successful empty history responses cached", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  vi.mocked(fetchMarketPriceHistory).mockImplementation(
    async (_id, _signal, tier = "NEAR_MINT") => ({
      ...history(tier),
      ...(tier === "DAMAGED" ? { series: {} } : {}),
    }),
  );
  render(
    <PokeTraceMarketPrices
      hasMarketHistoryAccess
      cardId={cardId}
      data={liveData}
    />,
  );
  await screen.findByRole("img");
  selectTier("Damaged");
  await screen.findByText("No price history");
  expect(fetchMarketPriceHistory).toHaveBeenCalledTimes(2);
  selectTier("Near Mint");
  selectTier("Damaged");
  expect(screen.getByText("No price history")).toBeVisible();
  expect(fetchMarketPriceHistory).toHaveBeenCalledTimes(2);
});

test("keeps the same graph and period visible under a spinner until the selected grade loads", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  let resolveGrade!: (value: MarketPriceHistoryResponse) => void;
  const previous = history("NEAR_MINT");
  const older = new Date(Date.now() - 120 * 86400000)
    .toISOString()
    .slice(0, 10);
  previous.series.ebay!.unshift({
    ...previous.series.ebay![0],
    date: older,
    avg: 200,
  });
  vi.mocked(fetchMarketPriceHistory).mockImplementation(
    async (_id, _signal, tier = "NEAR_MINT") => {
      if (tier === "PSA_8")
        return new Promise((resolve) => {
          resolveGrade = resolve;
        });
      return previous;
    },
  );
  render(
    <PokeTraceMarketPrices
      hasMarketHistoryAccess
      cardId={cardId}
      data={liveData}
    />,
  );
  const chart = await screen.findByRole("img");
  fireEvent.click(screen.getByRole("radio", { name: "6M" }));
  const line = document.querySelector(".poketrace-market__history-line--ebay")!;
  const path = line.getAttribute("d");
  selectTier("PSA 8");
  expect(screen.getByRole("img")).toBe(chart);
  expect(line).toHaveAttribute("d", path);
  expect(chart).toHaveAttribute(
    "aria-label",
    expect.stringContaining("Near Mint"),
  );
  expect(
    screen.getByRole("status", { name: "Loading marketplace price history" }),
  ).toBeVisible();
  expect(chart.closest("section")).toHaveAttribute("aria-busy", "true");
  expect(chart.closest("section")).toHaveClass(
    "poketrace-market__history--grade-loading",
  );
  const spinner = screen.getByRole("status", {
    name: "Loading marketplace price history",
  });
  expect(spinner.parentElement).toBe(chart.parentElement);
  expect(chart).not.toHaveClass("ui-render-fade");
  expect(line).toHaveClass("ui-render-fade");
  expect(spinner.parentElement).not.toHaveClass("ui-render-fade");
  expect(screen.getByRole("radio", { name: "6M" })).toBeChecked();
  const grade = history("PSA_8");
  grade.series.ebay!.unshift({
    ...grade.series.ebay![0],
    date: older,
    median7d: 300,
  });
  await act(async () => {
    resolveGrade(grade);
  });
  expect(screen.getByRole("img")).toBe(chart);
  expect(chart).toHaveAttribute("aria-label", expect.stringContaining("PSA 8"));
  expect(chart.closest("section")).toHaveAttribute("aria-busy", "false");
  expect(chart.closest("section")).not.toHaveClass(
    "poketrace-market__history--grade-loading",
  );
  expect(
    screen.queryByRole("status", { name: "Loading marketplace price history" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "6M" })).toBeChecked();
});

test("grade overlay is absent on initial page loading, raw-condition switches, and general data refreshes", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  let resolveRaw!: (value: MarketPriceHistoryResponse) => void;
  let resolveGrade!: (value: MarketPriceHistoryResponse) => void;
  vi.mocked(fetchMarketPriceHistory).mockImplementation(
    async (_id, _signal, tier = "NEAR_MINT") => {
      if (tier === "LIGHTLY_PLAYED")
        return new Promise((resolve) => {
          resolveRaw = resolve;
        });
      if (tier === "PSA_8")
        return new Promise((resolve) => {
          resolveGrade = resolve;
        });
      return history(tier);
    },
  );
  const { container, rerender } = render(
    <PokeTraceMarketPrices
      hasMarketHistoryAccess
      cardId={cardId}
      data={liveData}
    />,
  );
  expect(
    container.querySelector(".poketrace-market__history--grade-loading"),
  ).toBeNull();
  await screen.findByRole("img");
  selectTier("Lightly Played");
  expect(
    screen.getByRole("status", { name: "Loading marketplace price history" }),
  ).toBeVisible();
  expect(
    container.querySelector(".poketrace-market__history--grade-loading"),
  ).toBeNull();
  await act(async () => {
    resolveRaw(history("LIGHTLY_PLAYED"));
  });
  selectTier("PSA 8");
  expect(
    container.querySelector(".poketrace-market__history--grade-loading"),
  ).not.toBeNull();
  rerender(
    <PokeTraceMarketPrices
      hasMarketHistoryAccess
      cardId={cardId}
      data={liveData}
      dataPending
    />,
  );
  expect(
    container.querySelector(".poketrace-market__history--grade-loading"),
  ).toBeNull();
  await act(async () => {
    resolveGrade(history("PSA_8"));
  });
});

test("retains the most recently displayed cached tier during another fetch, and clears it on card changes", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  let resolveAbandoned!: (value: MarketPriceHistoryResponse) => void;
  let resolveNext!: (value: MarketPriceHistoryResponse) => void;
  const nextId = "019bff77-befa-771d-bab1-9c2f54818627";
  vi.mocked(fetchMarketPriceHistory).mockImplementation(
    async (id, _signal, tier = "NEAR_MINT") => {
      if (id === nextId)
        return new Promise((resolve) => {
          resolveNext = resolve;
        });
      if (tier === "BGS_9")
        return new Promise((resolve) => {
          resolveAbandoned = resolve;
        });
      return history(tier);
    },
  );
  const { rerender } = render(
    <PokeTraceMarketPrices
      hasMarketHistoryAccess
      cardId={cardId}
      data={liveData}
    />,
  );
  await screen.findByRole("img");
  selectTier("PSA 8");
  await screen.findByRole("img", { name: /PSA 8/ });
  selectTier("Near Mint");
  selectTier("BGS 9");
  expect(screen.getByRole("img")).toHaveAttribute(
    "aria-label",
    expect.stringContaining("Near Mint"),
  );
  rerender(
    <PokeTraceMarketPrices
      hasMarketHistoryAccess
      cardId={nextId}
      data={liveData}
    />,
  );
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  await act(async () => {
    resolveAbandoned(history("BGS_9"));
  });
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  await act(async () => {
    resolveNext({ ...history("NEAR_MINT"), cardId: nextId });
  });
  expect(screen.getByRole("img")).toHaveAttribute(
    "aria-label",
    expect.stringContaining("Near Mint"),
  );
  expect(
    screen.queryByRole("status", { name: "Loading marketplace price history" }),
  ).not.toBeInTheDocument();
});

test("renders mock previews with disabled controls and overlays limited to their data areas", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  vi.mocked(fetchMarketPriceHistory).mockResolvedValue(history("NEAR_MINT"));
  const onToggleGradingCalculator = vi.fn();
  render(
    <PokeTraceMarketPrices
      cardId={cardId}
      data={liveData}
      onToggleGradingCalculator={onToggleGradingCalculator}
    />,
  );
  expect(
    screen.getAllByText("Available with Basic or Pro membership."),
  ).toHaveLength(2);
  expect(
    screen.getByRole("button", {
      name: "Price history condition or grade",
    }),
  ).toBeDisabled();
  expect(screen.queryByText("$500.00")).not.toBeInTheDocument();
  expect(screen.getByText("$320.00")).toBeInTheDocument();
  expect(
    document.querySelector(
      ".poketrace-market__history-body > .poketrace-market__locked-overlay",
    ),
  ).toBeInTheDocument();
  expect(
    document.querySelector(
      ".poketrace-market__graded-body > .poketrace-market__locked-overlay",
    ),
  ).toBeInTheDocument();
  for (const radio of document.querySelectorAll(
    '.poketrace-market__access-content input[type="radio"], .poketrace-market__graded-controls input[type="radio"]',
  )) {
    expect(radio).toBeDisabled();
  }
  const calculator = screen.getByRole("button", { name: "Grading Calculator" });
  expect(calculator).toBeEnabled();
  fireEvent.click(calculator);
  expect(onToggleGradingCalculator).toHaveBeenCalledTimes(1);
  expect(fetchMarketPriceHistory).not.toHaveBeenCalled();
  expect(fetchCardPriceHistory).toHaveBeenCalledTimes(1);
  expect(
    document.querySelector(".poketrace-market__history-chart"),
  ).toBeInTheDocument();
});

test("locks previously visible data when access is removed", async () => {
  vi.mocked(fetchCardPriceHistory).mockResolvedValue({
    cardId,
    days: 9,
    snapshots: [],
  });
  vi.mocked(fetchMarketPriceHistory).mockResolvedValue(history("NEAR_MINT"));
  const { rerender } = render(
    <PokeTraceMarketPrices
      cardId={cardId}
      data={liveData}
      hasMarketHistoryAccess
    />,
  );
  await waitFor(() => expect(fetchMarketPriceHistory).toHaveBeenCalledTimes(1));
  vi.mocked(fetchMarketPriceHistory).mockClear();
  vi.mocked(fetchCardPriceHistory).mockClear();
  rerender(<PokeTraceMarketPrices cardId={cardId} data={liveData} />);
  expect(
    screen.getAllByText("Available with Basic or Pro membership."),
  ).toHaveLength(2);
  expect(
    screen.getByRole("button", {
      name: "Price history condition or grade",
    }),
  ).toBeDisabled();
  expect(fetchMarketPriceHistory).not.toHaveBeenCalled();
  expect(fetchCardPriceHistory).not.toHaveBeenCalled();
});
