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
  fireEvent.keyDown(first, { key: "Escape" });
  expect(first.parentElement).toHaveAttribute("data-open", "false");
});
