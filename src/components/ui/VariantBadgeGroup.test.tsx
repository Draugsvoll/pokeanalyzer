import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { VariantBadgeGroup } from "./VariantBadgeGroup";

function VariantPicker({ label }: { label: string }) {
  const [value, setValue] = useState(0);
  return (
    <VariantBadgeGroup
      ariaLabel={label}
      options={[
        { value: 0, label: "Holofoil" },
        { value: 1, label: "Reverse Holofoil" },
      ]}
      value={value}
      onChange={setValue}
    />
  );
}

test("switches variants without changing another group's selection", () => {
  render(
    <>
      <VariantPicker label="Grading variant" />
      <VariantPicker label="Collector variant" />
    </>,
  );
  const grading = within(
    screen.getByRole("group", { name: "Grading variant" }),
  );
  const collector = within(
    screen.getByRole("group", { name: "Collector variant" }),
  );

  fireEvent.click(grading.getByRole("radio", { name: "Reverse Holofoil" }));

  expect(
    grading.getByRole("radio", { name: "Reverse Holofoil" }),
  ).toBeChecked();
  expect(grading.getByRole("radio", { name: "Holofoil" })).not.toBeChecked();
  expect(collector.getByRole("radio", { name: "Holofoil" })).toBeChecked();
});
