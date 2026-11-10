import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SelectDropdown } from "./SelectDropdown";

const options = [
  { value: "price-high", label: "Price: high–low" },
  { value: "price-low", label: "Price: low–high" },
];

test("returns focus to the trigger after selecting a focused option", () => {
  const onChange = vi.fn();
  render(
    <SelectDropdown
      ariaLabel="Filter by grade"
      options={[
        { value: "all", label: "All grades" },
        { value: "10", label: "Grade 10", count: 5 },
      ]}
      value="all"
      onChange={onChange}
    />,
  );
  const trigger = screen.getByRole("button", { name: "Filter by grade" });
  fireEvent.click(trigger);
  const option = screen.getByRole("option", { name: "Grade 10 (5)" });
  option.focus();
  expect(option).toHaveFocus();
  fireEvent.click(option);
  expect(onChange).toHaveBeenCalledWith("10");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test("shows a placeholder without adding it to the choices, then displays the selected option", () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <SelectDropdown
      ariaLabel="Sort cards"
      placeholder="Sort by"
      options={options}
      value="none"
      onChange={onChange}
    />,
  );
  expect(screen.getByRole("button", { name: "Sort cards" })).toHaveTextContent(
    "Sort by",
  );
  fireEvent.click(screen.getByRole("button", { name: "Sort cards" }));
  expect(screen.getAllByRole("option")).toHaveLength(2);
  expect(screen.queryByRole("option", { name: "Sort by" })).toBeNull();
  expect(
    screen
      .getAllByRole("option")
      .every((option) => option.getAttribute("aria-selected") === "false"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("option", { name: "Price: high–low" }));
  expect(onChange).toHaveBeenCalledWith("price-high");
  rerender(
    <SelectDropdown
      ariaLabel="Sort cards"
      placeholder="Sort by"
      options={options}
      value="price-high"
      onChange={onChange}
    />,
  );
  expect(screen.getByRole("button", { name: "Sort cards" })).toHaveTextContent(
    "Price: high–low",
  );
});

test("preserves the first-option fallback for dropdowns without a placeholder", () => {
  render(
    <SelectDropdown
      ariaLabel="Existing dropdown"
      options={options}
      value="none"
      onChange={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Existing dropdown" }),
  ).toHaveTextContent("Price: high–low");
});
