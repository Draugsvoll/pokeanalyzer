import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorthGradingView } from "./WorthGradingView";

describe("WorthGradingView", () => {
  it("renders every current worth-grading text field", () => {
    const response = JSON.stringify({
      variants: [
        {
          card: {
            name: "Charizard",
            number: "4/102",
            set: "Base Set",
            variant_name: "Unlimited Holofoil",
          },
          assumptions: [
            {
              title: "Card condition",
              assumption: "The card is clean enough to consider grading.",
            },
          ],
          confidence_level: {
            score: "84",
            reasoning: "Recent sales and population data were available.",
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
            source:
              "https://www.psacard.com/pop/tcg-cards/1999/pokemon-game/57801",
            psa_population_total: 1000,
            psa_population_psa10: 100,
            psa_population_psa9: 250,
            psa_population_psa8: 300,
            psa_population_psa7: 200,
            psa_population_psa6: 100,
          },
          recommendation: {
            potential: "negative",
            headline: "Grade only copies with a strong chance at PSA 9.",
            bottom_line: "Sell visibly worn copies raw.",
            notes: ["Check the holofoil carefully for scratches."],
          },
        },
      ],
    });

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

    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    expect(
      screen.getByText(
        "The estimated card value remains within the Value tier limit.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: "View PSA Population Report" }),
    ).toHaveAttribute(
      "href",
      "https://www.psacard.com/pop/tcg-cards/1999/pokemon-game/57801",
    );
    expect(
      screen.getByText("Check the holofoil carefully for scratches."),
    ).toBeInTheDocument();
  });
});
