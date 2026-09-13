import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorthGradingView } from "./WorthGradingView";

const response = JSON.stringify({
  variants: [
    {
      card: {
        name: "Charizard",
        number: "4/102",
        set: "Base Set",
        variant_name: "Unlimited Holofoil",
      },
      attractiveness_level: {
        score: "72",
        reasoning: [
          "PSA 9 offers a meaningful advantage over selling raw.",
          "PSA 10 has strong upside but thinner comparable sales.",
        ],
      },
      raw_sale_today: {
        gross_sale_usd: 200,
        estimated_fees_usd: 25,
        net_proceeds_usd: 175,
        time_to_sell: "Two to four weeks",
      },
      graded_scenarios: [
        {
          grade: "PSA 9",
          expected_sale_price_usd: 500,
          grading_tier: "Value",
          grading_tier_justification:
            "The estimated card value remains within the Value tier limit.",
          psa_grading_fee_usd: 25,
          shipping_and_insurance_usd: 20,
          ebay_fees_usd: 65,
          ebay_fee_model: "Standard trading-card fee",
          roi_vs_raw_net_percent: 122.9,
          net_profit_vs_raw_usd: 215,
          turnaround_time: "45 business days",
          psa_note: null,
        },
      ],
      psa_population: {
        source: "https://www.psacard.com/pop/tcg-cards/1999/pokemon-game/57801",
        psa_population_total: 1000,
        psa_population_psa10: 100,
        psa_population_psa9: 250,
        psa_population_psa8: 300,
        psa_population_psa7: 200,
        psa_population_psa6: 100,
      },
      potential: "negative",
      headline: "Grade only copies with a strong chance at PSA 9.",
      bottom_line: "Sell visibly worn copies raw.",
      risk_profile: {
        label: "high",
        explanation: "Uncertain grading outcomes increase the risk.",
      },
    },
  ],
});

describe("WorthGradingView", () => {
  it("renders the current worth-grading analysis", () => {
    render(
      <WorthGradingView
        grokRequest={{ error: "", loading: false, response }}
      />,
    );

    expect(
      screen.getByText("PSA 9 offers a meaningful advantage over selling raw."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "PSA 10 has strong upside but thinner comparable sales.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Negative max profit")).toHaveClass(
      "app-badge--accent-red",
    );
    for (const name of ["Calculations", "Summary", "PSA Population"]) {
      expect(
        screen.getByRole("heading", { level: 2, name }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByText("Sell visibly worn copies raw."),
    ).toBeInTheDocument();
    expect(screen.getByText("High risk profile")).toBeInTheDocument();
    expect(
      screen.getByText("Uncertain grading outcomes increase the risk."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Calculations" }));
    expect(
      screen.queryByText(
        "The estimated card value remains within the Value tier limit.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "View population source" }),
    ).toBeNull();
    expect(screen.queryByText("Analysis confidence")).not.toBeInTheDocument();
  });

  it("omits PSA population when counts are missing", () => {
    const data = JSON.parse(response);
    data.variants[0].psa_population = { psa_population_total: null };
    data.variants[0].attractiveness_level.score = "1";
    data.variants[0].potential = "mixed";
    data.variants[0].risk_profile.label = "variable";

    render(
      <WorthGradingView
        grokRequest={{
          error: "",
          loading: false,
          response: JSON.stringify(data),
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Calculations" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "PSA Population" }),
    ).toBeNull();
    expect(screen.getByText("Mixed max profit")).toBeInTheDocument();
  });

  it("omits PSA population when the field is absent", () => {
    const data = JSON.parse(response);
    delete data.variants[0].psa_population;

    render(
      <WorthGradingView
        grokRequest={{
          error: "",
          loading: false,
          response: JSON.stringify(data),
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Summary" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "PSA Population" }),
    ).toBeNull();
  });

  it("omits unavailable sell time, turnaround, and grading tier", () => {
    const data = JSON.parse(response);
    data.variants[0].raw_sale_today.time_to_sell = null;
    Object.assign(data.variants[0].graded_scenarios[0], {
      grading_tier: null,
      grading_tier_justification: null,
      ebay_fee_model: null,
      turnaround_time: null,
    });

    render(
      <WorthGradingView
        grokRequest={{
          error: "",
          loading: false,
          response: JSON.stringify(data),
        }}
      />,
    );

    expect(screen.queryByText("eBay sell time")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Calculations" }));
    expect(screen.queryByText("turnaround")).not.toBeInTheDocument();
    expect(screen.queryByText("grading tier")).not.toBeInTheDocument();
    expect(screen.getAllByText("eBay Fees")).toHaveLength(2);
  });

  it("rejects a required field with the wrong type", () => {
    const data = JSON.parse(response);
    data.variants[0].graded_scenarios[0].net_profit_vs_raw_usd = "215";

    render(
      <WorthGradingView
        grokRequest={{
          error: "",
          loading: false,
          response: JSON.stringify(data),
        }}
      />,
    );

    expect(screen.getByText("Couldn't fetch data.")).toBeInTheDocument();
  });

  it("rejects an attractiveness score outside the 1–100 integer range", () => {
    const data = JSON.parse(response);
    data.variants[0].attractiveness_level.score = "0";
    render(
      <WorthGradingView
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
