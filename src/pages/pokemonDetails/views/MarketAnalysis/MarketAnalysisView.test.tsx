import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketAnalysisView } from "./MarketAnalysisView";

const response = JSON.stringify({
  score: 63,
  explanation: [
    "Steady demand and liquidity support a functional market.",
    "Recent pricing supports the overall assessment.",
  ],
  headline: "Prices and sales activity are broadly stable.",
  evidence_quality: {
    score: 72,
    reason: "Several recent sales were available.",
  },
  market_balance: {
    label: "balanced",
    explanation: "Supply and demand are broadly matched.",
  },
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
  healthiest_segment: {
    label: "PSA 9",
    explanation: "Recent sales and listings support steady activity.",
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
      screen.queryByRole("img", {
        name: "Market health score: 63 out of 100",
      }),
    ).toHaveTextContent("63");
    expect(
      screen.getByText("Prices and sales activity are broadly stable."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Summary" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        level: 4,
        name: "Position in the market",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Other" })).toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: "Outlook" }),
    ).toBeInTheDocument();
    const detailsContainer = screen
      .getByRole("heading", { level: 2, name: "Summary" })
      .closest(".default-container");
    expect(
      screen
        .getByRole("heading", { name: "Analysis confidence" })
        .closest(".market-analysis-report__summary-section"),
    ).toBe(
      screen
        .getByRole("heading", { level: 2, name: "Summary" })
        .closest(".market-analysis-report__summary-section"),
    );
    expect(detailsContainer).not.toBe(
      screen
        .getByRole("heading", { level: 2, name: "Outlook" })
        .closest(".default-container"),
    );
    expect(
      screen.queryByText(
        "Steady demand and liquidity support a functional market.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Recent pricing supports the overall assessment."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Recent sales show steady buyer interest."),
    ).toBeInTheDocument();
    expect(screen.getByText("PSA 9")).toBeInTheDocument();
    expect(
      screen.getByText("Recent sales and listings support steady activity."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Supply and demand are broadly matched."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Healthiest segment" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Market balance" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Demand" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Demand score: 61 out of 100" }),
    ).toHaveTextContent("61");
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

  it("renders valid scores and flexible labels", () => {
    const data = JSON.parse(response);
    render(
      <MarketAnalysisView
        grokRequest={{
          error: "",
          loading: false,
          response: JSON.stringify({
            ...data,
            score: 1,
            market_balance: { ...data.market_balance, label: "mixed by grade" },
            outlook: {
              ...data.outlook,
              near_term: { ...data.outlook.near_term, label: "flat" },
            },
          }),
        }}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Market health score: 1 out of 100" }),
    ).toHaveTextContent("1");
    expect(screen.getByText("Mixed by grade")).toBeInTheDocument();
    expect(screen.getByText("Flat")).toBeInTheDocument();
  });

  it("rejects responses with incorrect field types", () => {
    render(
      <MarketAnalysisView
        grokRequest={{
          error: "",
          loading: false,
          response: JSON.stringify({
            ...JSON.parse(response),
            explanation: "A legacy string explanation.",
          }),
        }}
      />,
    );

    expect(screen.getByText("Couldn't fetch data.")).toBeInTheDocument();
  });

  it("rejects market scores outside the 1–100 integer range", () => {
    const data = JSON.parse(response);
    data.market_signals.demand.score = 0;
    render(
      <MarketAnalysisView
        grokRequest={{
          error: "",
          loading: false,
          response: JSON.stringify(data),
        }}
      />,
    );
    expect(screen.getByText("Couldn't fetch data.")).toBeInTheDocument();
  });

  it("rejects the old single-string healthiest segment", () => {
    const data = JSON.parse(response);
    data.healthiest_segment = "PSA 9";
    render(
      <MarketAnalysisView
        grokRequest={{
          error: "",
          loading: false,
          response: JSON.stringify(data),
        }}
      />,
    );
    expect(screen.getByText("Couldn't fetch data.")).toBeInTheDocument();
  });
});
