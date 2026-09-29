import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { PriceChange } from "./PriceChange";

test("renders a directional percentage with shared arrow styling", () => {
  render(<PriceChange percent={2.74} title="7-day price change" />);

  const change = screen.getByLabelText(
    "Price increased by 2.7%. 7-day price change",
  );
  expect(change).toHaveTextContent("2.7%");
  expect(change).toHaveClass("app-price-change--up");
  expect(change.querySelector(".app-price-change__arrow--up")).not.toBeNull();
});

test("renders unavailable state without a directional arrow", () => {
  render(<PriceChange percent={null} title="7-day price change" />);

  const change = screen.getByLabelText("Price change unavailable");
  expect(change).toHaveTextContent("-");
  expect(change).toHaveClass("app-price-change--unavailable");
  expect(change.querySelector(".app-price-change__arrow")).toBeNull();
});
