import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { EbayImagePreview } from "./EbayImagePreview";

test("loads the full resolution image on demand and falls back if it fails", () => {
  render(
    <EbayImagePreview src="/small.jpg" previewSrc="/large.jpg" title="Eevee" />,
  );
  expect(screen.getByAltText("Eevee")).toHaveAttribute("src", "/small.jpg");
  expect(screen.queryByAltText("Enlarged image: Eevee")).toBeNull();
  fireEvent.mouseEnter(
    screen.getByRole("button", { name: "Enlarge image: Eevee" }),
  );
  const preview = screen.getByAltText("Enlarged image: Eevee");
  expect(preview).toHaveAttribute("src", "/large.jpg");
  expect(screen.getByRole("status")).toHaveAccessibleName("Loading image");
  fireEvent.error(preview);
  expect(preview).toHaveAttribute("src", "/small.jpg");
  expect(screen.getByRole("status")).toHaveAccessibleName("Loading image");
  fireEvent.error(preview);
  expect(preview).toHaveAttribute("src", "/small.jpg");
  expect(screen.getByRole("status")).toHaveTextContent("Image unavailable");
});

test("shows loading feedback until the image loads and resets when reopened", () => {
  render(
    <EbayImagePreview src="/small.jpg" previewSrc="/large.jpg" title="Mew" />,
  );
  const trigger = screen.getByRole("button", { name: "Enlarge image: Mew" });
  fireEvent.mouseEnter(trigger);
  expect(screen.getByRole("status")).toHaveAccessibleName("Loading image");
  const preview = screen.getByAltText("Enlarged image: Mew");
  fireEvent.load(preview);
  expect(screen.queryByRole("status")).toBeNull();
  expect(preview).toBeVisible();
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.mouseEnter(trigger);
  expect(screen.getByRole("status")).toHaveAccessibleName("Loading image");
});

test("opens outside the listing and stays open while hovering the preview", () => {
  vi.useFakeTimers();
  try {
    const { container } = render(
      <EbayImagePreview src="/card.jpg" title="Charizard" />,
    );
    const trigger = screen.getByRole("button", {
      name: "Enlarge image: Charizard",
    });
    fireEvent.mouseEnter(trigger);
    const preview = screen.getByAltText("Enlarged image: Charizard");
    expect(container.contains(preview)).toBe(false);
    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(preview.parentElement!);
    act(() => vi.advanceTimersByTime(200));
    expect(preview).toBeInTheDocument();
    fireEvent.mouseLeave(preview.parentElement!);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByAltText("Enlarged image: Charizard")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("supports keyboard and tap, clamps to viewport, and dismisses on Escape or scroll", () => {
  render(<EbayImagePreview src="/card.jpg" title="Pikachu" />);
  const trigger = screen.getByRole("button", {
    name: "Enlarge image: Pikachu",
  });
  vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
    left: window.innerWidth - 60,
    right: window.innerWidth,
    top: window.innerHeight - 50,
  } as DOMRect);
  fireEvent.focus(trigger);
  const preview = screen.getByAltText("Enlarged image: Pikachu").parentElement!;
  expect(
    parseFloat(preview.style.left) + parseFloat(preview.style.width),
  ).toBeLessThanOrEqual(window.innerWidth - 12);
  expect(
    parseFloat(preview.style.top) + parseFloat(preview.style.height),
  ).toBeLessThanOrEqual(window.innerHeight - 12);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  fireEvent.scroll(window);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});
