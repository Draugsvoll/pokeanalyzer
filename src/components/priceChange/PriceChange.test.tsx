import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { PriceChange } from "./PriceChange";

test("renders a directional percentage with shared arrow styling", () => {
  render(<PriceChange percent={2.74} period="7d" title="7-day price change" />);

  const change = screen.getByLabelText(
    "Price increased by 2.7%. 7-day price change",
  );
  expect(change).toHaveTextContent("2.7%");
  expect(change).toHaveClass("app-price-change--up");
  expect(change.querySelector(".app-price-change__arrow--up")).not.toBeNull();
  expect(change.querySelector(".app-price-change__period")).toHaveTextContent(
    "7d",
  );
});

test("derives the compact label from the supplied period", () => {
  render(
    <PriceChange percent={2.74} period="30d" title="30-day price change" />,
  );

  expect(screen.getByText("30d")).toHaveClass("app-price-change__period");
});

test("renders unavailable state without a directional arrow", () => {
  render(<PriceChange percent={null} title="7-day price change" />);

  const change = screen.getByLabelText("Price change unavailable");
  expect(change).toHaveTextContent("-");
  expect(change).toHaveClass("app-price-change--unavailable");
  expect(change.querySelector(".app-price-change__arrow")).toBeNull();
});

test("renders zero as a muted downward arrow", () => {
  render(<PriceChange percent={0} title="7-day price change" />);

  const change = screen.getByLabelText(
    "Price unchanged by 0%. 7-day price change",
  );
  expect(change).toHaveTextContent("0%");
  expect(change).toHaveClass("app-price-change--flat");
  expect(change.querySelector(".app-price-change__arrow--flat")).not.toBeNull();
});
