import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketAnalysisView } from "./MarketAnalysisView";

const response = JSON.stringify({
  set_name: "Base Set",
  variant_name: "Unlimited Holofoil",
  score: 63,
  headline: "Prices and sales activity are broadly stable.",
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
  price_discovery: {
    label: "strong",
    explanation: "Recent transactions establish a consistent price range.",
  },
  eyes_on: {
    label: "Raw supply",
    explanation: "An increase in raw listings could affect realized prices.",
  },
});

describe("MarketAnalysisView", () => {
  it("renders the current market-analysis response shape", () => {
    render(
      <MarketAnalysisView
        grokRequest={{ error: "", loading: false, response }}
      />,
    );

    expect(screen.queryByText("Market Health")).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Market health score: 63 out of 100",
      }),
    ).toHaveTextContent("63");
    expect(
      screen.getByText("Prices and sales activity are broadly stable."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Summary" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Unlimited Holofoil")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Unlimited Holofoil" }),
    ).toBeChecked();
    expect(screen.queryByText("Base Set · Unlimited Holofoil")).toBeNull();
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
    expect(detailsContainer).not.toBe(
      screen
        .getByRole("heading", { level: 2, name: "Outlook" })
        .closest(".default-container"),
    );
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
    expect(
      screen.getByRole("heading", { name: "Price discovery" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Recent transactions establish a consistent price range.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "What to look for" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Raw supply")).toBeInTheDocument();
    expect(
      screen.getByText(
        "An increase in raw listings could affect realized prices.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Demand" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Demand score: 61 out of 100" }),
    ).toHaveTextContent("61");
    expect(
      screen.getByText("Consistent collector demand."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("More supply could pressure prices."),
    ).toBeInTheDocument();
  });

  it("renders valid scores and allowed labels", () => {
    const data = JSON.parse(response);
    render(
      <MarketAnalysisView
        grokRequest={{
          error: "",
          loading: false,
          response: JSON.stringify({
            ...data,
            score: 1,
            market_balance: { ...data.market_balance, label: "seller_favored" },
            outlook: {
              ...data.outlook,
              near_term: {
                ...data.outlook.near_term,
                label: "very negative",
              },
            },
          }),
        }}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Market health score: 1 out of 100" }),
    ).toHaveTextContent("1");
    expect(screen.getByText("Seller favored")).toBeInTheDocument();
    expect(screen.getByText("Very negative")).toBeInTheDocument();
  });

  it("accepts a null optional eyes-on section", () => {
    const data = JSON.parse(response);
    render(
      <MarketAnalysisView
        grokRequest={{
          error: "",
          loading: false,
          response: JSON.stringify({ ...data, eyes_on: null }),
        }}
      />,
    );

    expect(
      screen.getByText("Prices and sales activity are broadly stable."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Raw supply")).toBeNull();
  });

  it("uses neutral details when an optional section is missing", () => {
    render(
      <MarketAnalysisView
        grokRequest={{
          error: "",
          loading: false,
          response: JSON.stringify({
            ...JSON.parse(response),
            price_discovery: undefined,
          }),
        }}
      />,
    );

    expect(screen.getByText("Not provided")).toBeInTheDocument();
  });

  it("rejects reports without a valid market signal", () => {
    const data = JSON.parse(response);
    data.market_signals = {
      demand: { score: 0, explanation: "Invalid score." },
    };
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

  it("uses a neutral detail for an old single-string healthiest segment", () => {
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
    expect(screen.getByText("Not provided")).toBeInTheDocument();
  });
});
