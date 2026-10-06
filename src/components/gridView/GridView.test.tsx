import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { GridView } from "./GridView";

test("enables staggered card entry animation by default", () => {
  render(
    <GridView revealOnScroll={false}>
      <article>First card</article>
      <article>Second card</article>
    </GridView>,
  );

  const grid = screen.getByText("First card").parentElement;
  expect(grid).toHaveClass("card-grid", "ui-card-grid-enter");
});
