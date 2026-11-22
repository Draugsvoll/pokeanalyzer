import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import type { MarketSummaryPayload } from "../../../../types/news";
import { MarketSummary } from "./MarketSummary";

const payload: MarketSummaryPayload = {
  generatedAt: "2026-09-30T12:00:00.000Z",
  marketScore: null,
  marketScoreExplanation: [],
  marketTone: {
    headline: "The market remained balanced",
    label: "neutral",
  },
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
  marketDrivers: [],
  segmentSummary: [
    {
      key: "vintage",
      title: "Vintage",
      trend: "rising",
      description: "Older cards outperformed.",
    },
  ],
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
  expect(within(themesCard!).queryByText("positive")).toBeNull();
  expect(within(themesCard!).getByText("Modern corrections")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Segments" })).toBeVisible();
  expect(screen.getByText("Vintage")).toBeVisible();
  expect(screen.getByText("rising")).toBeVisible();
});

test("renders the shared score meter and explanation tooltip", () => {
  const explanation = [
    "Indexes eased over the week.",
    "Selective vintage strength kept the score from falling further.",
  ];
  const { container } = render(
    <MarketSummary
      payload={{
        ...payload,
        marketScore: 72,
        marketScoreExplanation: explanation,
      }}
    />,
  );

  expect(
    screen.getByRole("img", { name: "Market health score: 72 out of 100" }),
  ).toBeVisible();
  expect(
    container.querySelector(".feature-analysis-hero__eyebrow"),
  ).toHaveTextContent("Market health");
  const tooltipButton = screen.getByRole("button", {
    name: "Market health score explanation",
  });
  expect(tooltipButton).toHaveAccessibleDescription(
    /Market Health.*Indexes eased over the week\.\s*Selective vintage strength kept the score from falling further\./,
  );
  expect(screen.getByRole("tooltip")).toHaveTextContent("Market Health");
  fireEvent.click(tooltipButton);
  expect(tooltipButton.parentElement).toHaveAttribute("data-open", "true");
  expect(
    screen.queryByRole("heading", { name: "Liquidity" }),
  ).not.toBeInTheDocument();
});

test("skips the score meter when market score is out of range", () => {
  render(<MarketSummary payload={{ ...payload, marketScore: 0 as number }} />);

  expect(
    screen.queryByRole("img", { name: /Market health score/i }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Market health score explanation" }),
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
