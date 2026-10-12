import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { GridView } from "./GridView";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockGridLayout(initialColumns: number) {
  let columns = initialColumns;
  let resize = () => {};
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
  const getStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
    const style = getStyle(element);
    if (element.classList.contains("card-grid")) {
      Object.defineProperty(style, "gridTemplateColumns", {
        value: Array(columns).fill("200px").join(" "),
      });
    }
    return style;
  });
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
  return (nextColumns: number) => {
    columns = nextColumns;
    act(() => resize());
  };
}

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

test("minimized categories keep one responsive row and toggle to the full grid", () => {
  const resize = mockGridLayout(3);
  const { container } = render(
    <GridView minimized title="Daily cards" revealOnScroll={false}>
      <div data-grid-full-width>Controls</div>
      {Array.from({ length: 6 }, (_, index) => (
        <a key={index} href={`/card/${index}`}>
          Card {index + 1}
        </a>
      ))}
      <div data-grid-full-width>Footer</div>
    </GridView>,
  );
  const hiddenCount = () =>
    container.querySelectorAll("[data-grid-overflow]").length;
  expect(hiddenCount()).toBe(3);
  expect(screen.getByText("Controls")).not.toHaveAttribute(
    "data-grid-overflow",
  );
  expect(screen.getByText("Footer")).not.toHaveAttribute("data-grid-overflow");
  expect(container.querySelector(".card-grid")).not.toHaveAttribute("hidden");
  const toggle = screen.getByRole("button", {
    name: "Show more of Daily cards",
  });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(toggle);
  expect(hiddenCount()).toBe(0);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  resize(1);
  expect(hiddenCount()).toBe(0);
  fireEvent.click(
    screen.getByRole("button", { name: "Show less of Daily cards" }),
  );
  expect(hiddenCount()).toBe(5);
  resize(2);
  expect(hiddenCount()).toBe(4);
  resize(6);
  expect(hiddenCount()).toBe(0);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("minimized loading and error states remain visible and cards are measured when loaded", () => {
  mockGridLayout(1);
  const { rerender } = render(
    <GridView minimized title="Daily cards" revealOnScroll={false}>
      <div role="status" data-grid-full-width>
        Loading
      </div>
    </GridView>,
  );
  expect(screen.getByRole("status")).not.toHaveAttribute("data-grid-overflow");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  rerender(
    <GridView minimized title="Daily cards" revealOnScroll={false}>
      <div role="alert" data-grid-full-width>
        Try again
      </div>
    </GridView>,
  );
  expect(screen.getByRole("alert")).not.toHaveAttribute("data-grid-overflow");
  rerender(
    <GridView minimized title="Daily cards" revealOnScroll={false}>
      <a href="/first">First</a>
      <a href="/second">Second</a>
    </GridView>,
  );
  expect(screen.getByText("First")).not.toHaveAttribute("data-grid-overflow");
  expect(screen.getByText("Second")).toHaveAttribute("data-grid-overflow");
  expect(
    screen.getByRole("button", { name: "Show more of Daily cards" }),
  ).toBeInTheDocument();
});

test("never hides items without a header to toggle them", () => {
  mockGridLayout(1);
  const { container, rerender } = render(
    <GridView minimized revealOnScroll={false}>
      <a href="/first">First</a>
      <a href="/second">Second</a>
    </GridView>,
  );
  expect(container.querySelector("[data-grid-overflow]")).toBeNull();
  rerender(
    <GridView minimized title="Cards" revealOnScroll={false}>
      <a href="/first">First</a>
      <a href="/second">Second</a>
    </GridView>,
  );
  expect(screen.getByText("Second")).toHaveAttribute("data-grid-overflow");
  rerender(
    <GridView minimized revealOnScroll={false}>
      <a href="/first">First</a>
      <a href="/second">Second</a>
    </GridView>,
  );
  expect(container.querySelector("[data-grid-overflow]")).toBeNull();
});

test("turning minimized off restores every item and removes the toggle", () => {
  mockGridLayout(1);
  const cards = [
    <a key="first" href="/first">
      First
    </a>,
    <a key="second" href="/second">
      Second
    </a>,
  ];
  const { container, rerender } = render(
    <GridView minimized title="Cards" revealOnScroll={false}>
      {cards}
    </GridView>,
  );
  expect(screen.getByText("Second")).toHaveAttribute("data-grid-overflow");
  rerender(
    <GridView title="Cards" revealOnScroll={false}>
      {cards}
    </GridView>,
  );
  expect(container.querySelector("[data-grid-overflow]")).toBeNull();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
