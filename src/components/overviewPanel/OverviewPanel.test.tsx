import { createRef } from "react";
import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { OverviewMetric, OverviewPanel } from "./OverviewPanel";

test("marks the explicit responsive row boundary", () => {
  render(
    <OverviewPanel ariaLabel="Test summary">
      <OverviewMetric label="Primary" primary value="1" />
      <OverviewMetric
        detail="Compact detail"
        label="Compact"
        size="compact"
        value="2"
      />
      <OverviewMetric label="Featured" value="3" />
      <OverviewMetric
        breakBefore
        imageSrc="card.webp"
        label="Next row"
        value="4"
      />
      <OverviewMetric label="Trailing" value="5" />
    </OverviewPanel>,
  );

  const panel = screen.getByRole("region", { name: "Test summary" });
  const metrics = within(panel).getAllByRole("article");

  expect(panel.firstElementChild).toHaveClass("app-overview-panel__layout");
  expect(metrics[0]).toHaveClass("app-overview-metric--primary");
  expect(metrics[1]).toHaveClass("app-overview-metric--compact");
  expect(metrics[3]).toHaveClass(
    "app-overview-metric--break-before",
    "app-overview-metric--featured",
  );
  expect(metrics[4]).not.toHaveClass("app-overview-metric--break-before");
});

test("forwards the panel ref", () => {
  const ref = createRef<HTMLElement>();

  render(
    <OverviewPanel ariaLabel="Referenced summary" ref={ref}>
      <OverviewMetric label="Metric" value="1" />
    </OverviewPanel>,
  );

  expect(ref.current).toBe(
    screen.getByRole("region", { name: "Referenced summary" }),
  );
});
