import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketAnalysisView } from "./MarketAnalysisView";

const response = JSON.stringify({
  score: 63,
  explanation: "Steady demand and liquidity support a functional market.",
  headline: "Prices and sales activity are broadly stable.",
  evidence_quality: {
    score: 72,
    reason: "Several recent sales were available.",
  },
  market_balance: "balanced",
  market_signals: {
    demand: {
      score: 61,
      explanation: "Recent sales show steady buyer interest.",
    },
    liquidity: {
      score: 74,
      explanation: "Listings turn over regularly.",
    },
    momentum: {
      score: 55,
      explanation: "Prices have remained broadly stable.",
    },
    stability: {
      score: 42,
      explanation: "Sale prices remain within a consistent range.",
    },
  },
  outlook: {
    long_term: {
      label: "positive",
      explanation: "Established demand supports the longer term.",
    },
    near_term: {
      label: "stable",
      explanation: "Recent activity points to stable conditions.",
    },
    risks: ["More supply could pressure prices."],
    upside_drivers: ["Consistent collector demand."],
  },
  strongest_segment: "PSA 9",
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
        name: "Market health score: 63 out of 100",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Prices and sales activity are broadly stable."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Steady demand and liquidity support a functional market.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Recent sales show steady buyer interest."),
    ).toBeInTheDocument();
    expect(screen.getByText("PSA 9")).toBeInTheDocument();
    expect(screen.getByText("Demand: 61")).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Analysis confidence score: 72 out of 100",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Analysis confidence")).toBeInTheDocument();
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
