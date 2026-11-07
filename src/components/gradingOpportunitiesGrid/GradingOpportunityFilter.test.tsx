import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { GradingOpportunityFilter } from "./GradingOpportunityFilter";

test("hides the shared filter when there are no grading opportunities", () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <GradingOpportunityFilter count={0} checked={false} onChange={onChange} />,
  );
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  rerender(
    <GradingOpportunityFilter count={2} checked={false} onChange={onChange} />,
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: "2 grading opportunities" }),
  );
  expect(onChange).toHaveBeenCalledWith(true);
  rerender(
    <GradingOpportunityFilter count={1} checked={false} onChange={onChange} />,
  );
  expect(
    screen.getByRole("checkbox", { name: "1 grading opportunity" }),
  ).toBeVisible();
  rerender(<GradingOpportunityFilter count={0} checked onChange={onChange} />);
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
