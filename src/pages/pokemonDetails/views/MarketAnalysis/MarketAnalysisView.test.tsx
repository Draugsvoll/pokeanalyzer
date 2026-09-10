import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketAnalysisView } from "./MarketAnalysisView";

const response = JSON.stringify({
  card: {
    name: "Pikachu",
    number: "58",
    set: "Base Set",
    variant: "Unlimited",
  },
  evidence_quality: {
    confidence: "moderate",
    reason: "Several recent sales were available.",
  },
  market_balance: {
    reason: "Supply and buyer activity are balanced.",
    state: "balanced",
  },
  market_pulse: "Buyers remain active at established price levels.",
  market_sentiment: {
    label: "neutral",
    score: 63,
    summary: "Prices and sales activity are broadly stable.",
  },
  market_signals: {
    demand: {
      label: "moderate",
      reasoning: "Recent sales show steady buyer interest.",
    },
    liquidity: {
      label: "high",
      reasoning: "Listings turn over regularly.",
    },
    momentum: {
      label: "moderate",
      reasoning: "Prices have remained broadly stable.",
    },
    volatility: {
      label: "moderate",
      reasoning: "Sale prices remain within a consistent range.",
    },
  },
  outlook: {
    long_term: "constructive",
    near_term: "stable",
    risks: ["More supply could pressure prices."],
    summary: "The market appears stable.",
    upside_drivers: ["Consistent collector demand."],
  },
  strongest_segment: {
    label: "PSA 9",
    reason: "It has the healthiest balance of price and sale frequency.",
  },
});

describe("MarketAnalysisView", () => {
  it("renders the current market-analysis response shape", () => {
    render(
      <MarketAnalysisView
        grokRequest={{ error: "", loading: false, response }}
      />,
    );

    expect(screen.getByText("Market Health")).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Market sentiment score: 63 out of 100",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Prices and sales activity are broadly stable."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Buyers remain active at established price levels."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Recent sales show steady buyer interest."),
    ).toBeInTheDocument();
    expect(screen.getByText("PSA 9")).toBeInTheDocument();
    expect(
      screen.getByText("Consistent collector demand."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("More supply could pressure prices."),
    ).toBeInTheDocument();
  });

  it("rejects a malformed response", () => {
    render(
      <MarketAnalysisView
        grokRequest={{ error: "", loading: false, response: "{}" }}
      />,
    );

    expect(screen.getByText("Couldn't fetch data.")).toBeInTheDocument();
  });
});
