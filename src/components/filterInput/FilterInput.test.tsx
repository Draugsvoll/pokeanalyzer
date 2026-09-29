import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { FilterInput } from "./FilterInput";

function ControlledFilterInput() {
  const [value, setValue] = useState("Pikachu");
  return (
    <FilterInput
      ariaLabel="Filter cards"
      clearLabel="Clear card filter"
      onChange={setValue}
      placeholder="Filter"
      value={value}
    />
  );
}

test("clears the value and returns focus to the input", () => {
  render(<ControlledFilterInput />);

  const input = screen.getByRole("searchbox", { name: "Filter cards" });
  fireEvent.click(screen.getByRole("button", { name: "Clear card filter" }));

  expect(input).toHaveValue("");
  expect(input).toHaveFocus();
  expect(
    screen.queryByRole("button", { name: "Clear card filter" }),
  ).toBeNull();
});
