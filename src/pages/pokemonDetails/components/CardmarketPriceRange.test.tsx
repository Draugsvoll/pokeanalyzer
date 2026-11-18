import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CardmarketPriceRange } from "./CardmarketPriceRange";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("hides only the 30-day average when the full row cannot fit, and restores it on resize", () => {
  let width = 300;
  let resize!: () => void;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    () => width,
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return {
        width: this.textContent?.includes("30d avg") ? 120 : 80,
      } as DOMRect;
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  render(
    <CardmarketPriceRange
      from="€250.00"
      average30d="€1,730.43"
      trend="€2,082.00"
    />,
  );
  const average = screen.getByText("30d avg").parentElement!;
  expect(average).not.toHaveAttribute("hidden");

  width = 200;
  act(() => resize());
  expect(average).toHaveAttribute("hidden");
  expect(screen.getByText("From").parentElement).not.toHaveAttribute("hidden");
  expect(screen.getByText("Trend").parentElement).not.toHaveAttribute("hidden");

  width = 300;
  act(() => resize());
  expect(average).not.toHaveAttribute("hidden");
});
