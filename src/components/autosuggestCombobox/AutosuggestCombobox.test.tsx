import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type KeyboardEventHandler } from "react";
import { expect, test, vi } from "vitest";
import { AutosuggestCombobox } from "./AutosuggestCombobox";

const OPTIONS = [
  { label: "Base Set", value: "Base Set" },
  { label: "Base Set 2", value: "Base Set 2" },
  { label: "Jungle", value: "Jungle" },
];

function ControlledAutosuggest({
  onKeyDown = vi.fn(),
  onSelect = vi.fn(),
}: {
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onSelect?: (value: string) => void;
}) {
  const [value, setValue] = useState("");

  return (
    <AutosuggestCombobox
      ariaLabel="Set name"
      menuLabel="Set name suggestions"
      onInputChange={setValue}
      onKeyDown={onKeyDown}
      onSelect={(selection) => {
        setValue(selection);
        onSelect(selection);
      }}
      options={OPTIONS}
      placeholder="Set"
      value={value}
    />
  );
}

test("filters suggestions and keeps options out of the tab order", () => {
  render(<ControlledAutosuggest />);

  const input = screen.getByRole("combobox", { name: "Set name" });
  fireEvent.change(input, { target: { value: "jungle" } });

  const option = screen.getByRole("option", { name: "Jungle" });
  expect(option).toHaveAttribute("tabindex", "-1");
  expect(
    screen.queryByRole("option", { name: "Base Set" }),
  ).not.toBeInTheDocument();
});

test("selects the active suggestion with the keyboard", () => {
  const onSelect = vi.fn();
  render(<ControlledAutosuggest onSelect={onSelect} />);

  const input = screen.getByRole("combobox", { name: "Set name" });
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });

  expect(onSelect).toHaveBeenCalledWith("Base Set");
  expect(input).toHaveValue("Base Set");
  expect(
    screen.queryByRole("listbox", { name: "Set name suggestions" }),
  ).not.toBeInTheDocument();
});

test("handles Escape only while its suggestion list is open", () => {
  const onKeyDown = vi.fn();
  render(<ControlledAutosuggest onKeyDown={onKeyDown} />);

  const input = screen.getByRole("combobox", { name: "Set name" });
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "Escape" });

  expect(onKeyDown).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("listbox", { name: "Set name suggestions" }),
  ).not.toBeInTheDocument();

  fireEvent.keyDown(input, { key: "Escape" });
  expect(onKeyDown).toHaveBeenCalledTimes(1);
});
