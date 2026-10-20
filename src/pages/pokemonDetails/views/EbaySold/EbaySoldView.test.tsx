import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import EbaySoldView from "./EbaySoldView";

function listing(index: number, listingType = "sold") {
  return {
    title: `Pikachu listing ${index}`,
    listingType,
    soldPrice: String(index),
    soldCurrency: "USD",
    currentPrice: String(index),
    currentCurrency: "USD",
    endedAt: `2026-10-${String(index).padStart(2, "0")}`,
    url: `https://www.ebay.com/itm/${index}`,
  };
}

test("renders controls before optional intro content without a premature empty-results message", () => {
  const { rerender } = render(
    <EbaySoldView response={null}>
      <button type="button">Search this card</button>
    </EbaySoldView>,
  );
  const intro = screen.getByRole("button", { name: "Search this card" });
  const sort = screen.getByRole("button", { name: "Sort eBay listings" });
  expect(sort.compareDocumentPosition(intro)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  expect(screen.getByRole("radio", { name: "Sold" })).toBeVisible();
  expect(screen.getByRole("radio", { name: "Grade 10" })).toBeVisible();
  expect(
    screen.getByRole("searchbox", { name: "Filter eBay results" }),
  ).toBeVisible();
  expect(screen.queryByText(/No matching eBay/)).not.toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("radio", { name: "Listed" }));
  rerender(<EbaySoldView response={{ sold: [], active: [] }} />);
  expect(screen.getByRole("radio", { name: "Listed" })).toBeChecked();
  expect(screen.getByText("No matching eBay listings found.")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Search this card" }),
  ).not.toBeInTheDocument();
});

test("counts all matching results while displaying them in batches", () => {
  render(
    <EbaySoldView
      response={{
        sold: Array.from({ length: 15 }, (_, index) => listing(index + 1)),
        active: [],
      }}
    />,
  );
  expect(screen.getAllByRole("article")).toHaveLength(10);
  expect(screen.getByRole("status")).toHaveTextContent("15 results");
  fireEvent.click(screen.getByRole("button", { name: "Show 5 more" }));
  expect(screen.getAllByRole("article")).toHaveLength(15);
  expect(screen.getByRole("status")).toHaveTextContent("15 results");
});

test("preserves sold/listed and text filtering behavior", async () => {
  render(
    <EbaySoldView
      response={{
        sold: [listing(1), { ...listing(2), title: "Pikachu stamped" }],
        active: [listing(3, "active")],
      }}
    />,
  );
  expect(screen.getAllByRole("link", { name: "View sale" })).toHaveLength(2);
  expect(screen.getByRole("status")).toHaveTextContent("2 results");
  fireEvent.click(screen.getByRole("radio", { name: "Listed" }));
  expect(screen.getAllByRole("link", { name: "Buy" })).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent("1 result");
  fireEvent.click(screen.getByRole("radio", { name: "Sold" }));
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Filter eBay results" }),
    {
      target: { value: "stamped" },
    },
  );
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
  expect(
    screen.getByRole("heading", { name: "Pikachu Stamped" }),
  ).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(/^1 result$/);

  fireEvent.change(
    screen.getByRole("searchbox", { name: "Filter eBay results" }),
    { target: { value: "missing" } },
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("0 results"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear eBay results filter" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("2 results"),
  );
});

test("updates the result count when filtering by grade", async () => {
  render(
    <EbaySoldView
      response={{
        sold: [listing(1), { ...listing(2), title: "Pikachu PSA 10" }],
        active: [],
      }}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("2 results");
  fireEvent.click(screen.getByRole("radio", { name: "Grade 10" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(/^1 result$/),
  );
  expect(screen.getAllByRole("article")).toHaveLength(1);
});

test("retains available results when the other provider request failed", () => {
  render(<EbaySoldView response={{ sold: [listing(1)], active: null }} />);
  expect(screen.getByRole("link", { name: "View sale" })).toBeVisible();
  fireEvent.click(screen.getByRole("radio", { name: "Listed" }));
  expect(screen.queryByText(/load these eBay listings/)).not.toBeInTheDocument();
  expect(screen.queryByText(/No matching eBay/)).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("combines exclusion with text and grade filters across sold and listed results", async () => {
  const items = [
    { ...listing(1), title: "Pikachu PSA 10 stamped" },
    { ...listing(2), title: "Pikachu PSA 10 regular" },
    { ...listing(3), title: "Pikachu raw" },
    { ...listing(4), title: "Charizard PSA 10 regular" },
  ];
  render(
    <EbaySoldView
      response={{
        sold: items,
        active: items.map((item) => ({ ...item, listingType: "active" })),
      }}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Grade 10" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Filter eBay results" }), {
    target: { value: "pikachu" },
  });
  fireEvent.change(screen.getByRole("searchbox", { name: "Exclude eBay results" }), {
    target: { value: "STAMPED" },
  });
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(/^1 result$/),
  );
  expect(screen.getByRole("heading", { name: "Pikachu Psa 10 Regular" })).toBeVisible();
  fireEvent.click(screen.getByRole("radio", { name: "Listed" }));
  expect(screen.getAllByRole("link", { name: "Buy" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Clear eBay exclusion filter" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("2 results"),
  );
});

test("exclusion resets pagination and ignores queries shorter than two characters", async () => {
  render(
    <EbaySoldView
      response={{ sold: Array.from({ length: 15 }, (_, index) => listing(index + 1)) }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show 5 more" }));
  const exclude = screen.getByRole("searchbox", { name: "Exclude eBay results" });
  fireEvent.change(exclude, { target: { value: "p" } });
  expect(screen.getByRole("status")).toHaveTextContent("15 results");
  fireEvent.change(exclude, { target: { value: "missing" } });
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(10));
  expect(screen.getByRole("status")).toHaveTextContent("15 results");
  fireEvent.change(exclude, { target: { value: "pikachu" } });
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("0 results"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear eBay exclusion filter" }));
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(10));
  expect(screen.getByRole("status")).toHaveTextContent("15 results");
});
