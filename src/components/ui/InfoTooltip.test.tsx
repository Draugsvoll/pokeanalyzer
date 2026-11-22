import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { InfoTooltip } from "./InfoTooltip";

test("gives each hint its own description and supports focus and Escape", () => {
  render(
    <>
      <InfoTooltip label="First hint">First explanation</InfoTooltip>
      <InfoTooltip label="Second hint">Second explanation</InfoTooltip>
    </>,
  );
  const first = screen.getByRole("button", { name: "First hint" });
  const second = screen.getByRole("button", { name: "Second hint" });
  expect(first).toHaveAccessibleDescription("First explanation");
  expect(second).toHaveAccessibleDescription("Second explanation");
  expect(first.getAttribute("aria-describedby")).not.toBe(
    second.getAttribute("aria-describedby"),
  );
  fireEvent.focus(first);
  expect(first.parentElement).toHaveAttribute("data-open", "true");
  expect(first).toHaveAttribute("aria-expanded", "true");
  fireEvent.keyDown(first, { key: "Escape" });
  expect(first.parentElement).toHaveAttribute("data-open", "false");
});

test("toggles on click and closes on an outside press", () => {
  render(<InfoTooltip label="Market hint">Score reasons</InfoTooltip>);
  const button = screen.getByRole("button", { name: "Market hint" });
  fireEvent.click(button);
  expect(button.parentElement).toHaveAttribute("data-open", "true");
  fireEvent.click(button);
  expect(button.parentElement).toHaveAttribute("data-open", "false");
  fireEvent.click(button);
  fireEvent.pointerDown(document.body);
  expect(button.parentElement).toHaveAttribute("data-open", "false");
});

test("a click keeps the tooltip open after the pointer leaves", () => {
  window.matchMedia = ((query: string) =>
    ({
      matches: query === "(hover: hover)",
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;

  render(<InfoTooltip label="Market hint">Score reasons</InfoTooltip>);
  const button = screen.getByRole("button", { name: "Market hint" });
  const root = button.parentElement!;
  fireEvent.click(button);
  fireEvent.mouseLeave(root);
  expect(root).toHaveAttribute("data-open", "true");
  fireEvent.mouseEnter(root);
  fireEvent.mouseLeave(root);
  expect(root).toHaveAttribute("data-open", "true");
});
