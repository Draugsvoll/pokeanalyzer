import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { GradingOpportunityBadge } from "./GradingOpportunityBadge";

test.each([
  [2.34, "2.3"],
  [2, "2.0"],
  [9.94, "9.9"],
  [10, "10"],
  [10.6, "11"],
  [1093.4, "1,093"],
])("formats multiplier %s as %s", (multiplier, label) => {
  render(<GradingOpportunityBadge multiplier={multiplier} />);
  expect(
    screen.getByLabelText(
      `${label} times TCGPlayer Near Mint price, based on eBay PSA 10 30-day median`,
    ),
  ).toHaveTextContent(`${label}×`);
});
