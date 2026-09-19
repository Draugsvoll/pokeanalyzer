import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CollectorAnalysis from "./CollectorAnalysisView";

const categoryNames = [
  "Rarity & Scarcity",
  "Collectors Demand",
  "Significance",
  "Artwork & Aesthetics",
  "Long-Term Collectibility",
];

const analysis = {
  variant_name: "Unlimited Holofoil",
  totalScore: "84",
  verdict: "A widely recognized collectible.",
  overview: "This print has a longstanding place in collections.",
  categories: categoryNames.map((name) => ({
    name,
    score: "78",
    text: `${name} supports its collector appeal.`,
  })),
  finalNote: [
    "Collectors value this print for its history.",
    "The holofoil is easy to distinguish from other versions.",
  ],
};

describe("CollectorAnalysis", () => {
  it("renders the current collector-analysis response shape", () => {
    render(
      <CollectorAnalysis
        grokRequest={{
          error: "",
          loading: false,
          response: JSON.stringify({ analyses: [analysis] }),
        }}
      />,
    );

    expect(screen.getByText("Unlimited Holofoil")).toBeInTheDocument();
    expect(screen.getByText(analysis.overview)).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Overall collector score: 84 out of 100",
      }),
    ).toBeInTheDocument();
    for (const name of categoryNames) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("heading", { name: "Overview" }),
    ).toBeInTheDocument();
    for (const paragraph of analysis.finalNote) {
      expect(screen.getByText(paragraph).tagName).toBe("P");
    }
  });

  it("renders entries without enforcing category names or count", () => {
    render(
      <CollectorAnalysis
        grokRequest={{
          error: "",
          loading: false,
          response: JSON.stringify({
            analyses: [
              {
                ...analysis,
                totalScore: "1",
                categories: [
                  {
                    name: "Custom category",
                    score: "1",
                    text: "Usable content.",
                  },
                ],
              },
            ],
          }),
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Custom category" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Overall collector score: 1 out of 100",
      }),
    ).toBeInTheDocument();
  });

  it("rejects the old single-string finalNote shape", () => {
    render(
      <CollectorAnalysis
        grokRequest={{
          error: "",
          loading: false,
          response: JSON.stringify({
            analyses: [{ ...analysis, finalNote: "Old string note" }],
          }),
        }}
      />,
    );

    expect(screen.getByText("Couldn't fetch data.")).toBeInTheDocument();
  });

  it("rejects category scores outside the 1–100 integer range", () => {
    render(
      <CollectorAnalysis
        grokRequest={{
          error: "",
          loading: false,
          response: JSON.stringify({
            analyses: [
              {
                ...analysis,
                categories: [{ name: "Custom", score: "101", text: "Reason." }],
              },
            ],
          }),
        }}
      />,
    );
    expect(screen.getByText("Couldn't fetch data.")).toBeInTheDocument();
  });
});
