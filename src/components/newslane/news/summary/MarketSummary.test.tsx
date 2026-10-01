import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import type { MarketSummaryPayload } from "../../../../types/news";
import { MarketSummary } from "./MarketSummary";

const payload: MarketSummaryPayload = {
  generatedAt: "2026-09-30T12:00:00.000Z",
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

test("groups each summary section while keeping the lead card full-width", () => {
  const { container } = render(<MarketSummary payload={payload} />);
  const themesHeading = screen.getByRole("heading", {
    name: "Highlights",
  });
  const themesCard = themesHeading.closest("article");
  const leadCard = screen
    .getByRole("heading", { name: "The market remained balanced" })
    .closest("article");

  expect(
    container.querySelectorAll(".market-summary__card--wide"),
  ).toHaveLength(1);
  expect(leadCard).toHaveClass("market-summary__card--wide");
  expect(
    screen.getByRole("heading", { name: "The market remained balanced" })
      .tagName,
  ).toBe("H2");
  expect(themesHeading.tagName).toBe("H4");
  expect(leadCard).toContainElement(
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
