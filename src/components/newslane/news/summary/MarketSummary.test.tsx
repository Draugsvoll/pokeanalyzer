import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import type { MarketSummaryPayload } from "../../../../types/news";
import { MarketSummary } from "./MarketSummary";

const payload: MarketSummaryPayload = {
  generatedAt: "2026-09-30T12:00:00.000Z",
  marketScore: null,
  marketTone: {
    headline: "The market remained balanced",
    label: "neutral",
  },
  marketOverview: ["Different segments moved independently."],
  keyThemesAndChanges: [
    {
      title: "New releases",
      label: "positive",
      theme: "Recent releases attracted demand.",
    },
    {
      title: "Modern corrections",
      label: "mixed",
      theme: "Selected modern cards moved lower.",
    },
  ],
  liquidity: [],
  marketDrivers: [],
  segmentSummary: [],
  collectorOutlook: {
    label: "neutral",
    outlook: "Older cards offset softness in recent releases.",
  },
  whatToWatch: [],
};

test("groups each summary section while keeping the lead hero full-width", () => {
  const { container } = render(<MarketSummary payload={payload} />);
  const themesHeading = screen.getByRole("heading", {
    name: "Highlights",
  });
  const themesCard = themesHeading.closest("article");
  const leadHero = container.querySelector(
    ".feature-analysis-hero",
  ) as HTMLElement | null;
  expect(container.querySelector(".market-summary__hero")).toContainElement(
    leadHero,
  );
  expect(leadHero?.querySelector(".feature-analysis-hero__eyebrow")).toBeNull();
  expect(
    screen.queryByRole("img", { name: /Market health score/i }),
  ).not.toBeInTheDocument();
  expect(
    container.querySelector(".market-summary__hero"),
  ).toHaveStyle("--feature-accent: var(--custom-color-blue)");
  expect(leadHero?.querySelector(".feature-analysis-hero__headline")).toHaveTextContent(
    "The market remained balanced",
  );
  expect(themesHeading.tagName).toBe("H3");
  expect(leadHero).toContainElement(
    screen.getByText("Older cards offset softness in recent releases."),
  );
  expect(
    screen.queryByText("Different segments moved independently."),
  ).toBeNull();
  expect(screen.queryByRole("heading", { name: "Market overview" })).toBeNull();
  expect(
    screen.queryByRole("heading", { name: "Collector outlook" }),
  ).toBeNull();
  expect(screen.queryByText("Market tone")).toBeNull();
  expect(screen.getByText("neutral Sentiment")).toBeVisible();
  expect(themesCard).not.toBeNull();
  expect(themesCard).toHaveStyle("--news-accent: var(--custom-color-purple)");
  expect(within(themesCard!).getByRole("list")).toBeVisible();
  expect(within(themesCard!).getAllByRole("listitem")).toHaveLength(2);
  expect(within(themesCard!).getByText("New releases")).toBeVisible();
  expect(within(themesCard!).getByText("Modern corrections")).toBeVisible();
});

test("renders the shared score meter for a valid market score", () => {
  const { container } = render(
    <MarketSummary payload={{ ...payload, marketScore: 72 }} />,
  );

  expect(
    screen.getByRole("img", { name: "Market health score: 72 out of 100" }),
  ).toBeVisible();
  expect(
    container.querySelector(".feature-analysis-hero__eyebrow"),
  ).toHaveTextContent("Market health");
});

test("skips the score meter when market score is out of range", () => {
  render(<MarketSummary payload={{ ...payload, marketScore: 0 as number }} />);

  expect(
    screen.queryByRole("img", { name: /Market health score/i }),
  ).not.toBeInTheDocument();
});

test("matches the hero accent to the market tone color", () => {
  const { container } = render(
    <MarketSummary
      payload={{
        ...payload,
        marketTone: { headline: "Demand improved", label: "positive" },
      }}
    />,
  );

  expect(container.querySelector(".market-summary__hero")).toHaveStyle(
    "--feature-accent: var(--custom-color-green)",
  );
  expect(screen.getByText("positive Sentiment")).toBeVisible();
});
