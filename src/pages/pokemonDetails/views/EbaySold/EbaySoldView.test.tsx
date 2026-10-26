import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
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
  const sort = screen.getByRole("radiogroup", { name: "Sort Ebay listings" });
  expect(sort.compareDocumentPosition(intro)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  expect(screen.getByRole("radio", { name: "Sold" })).toBeVisible();
  expect(screen.getByRole("radio", { name: "Grade 10" })).toBeVisible();
  expect(
    screen.getByRole("searchbox", { name: "Include keywords" }),
  ).toBeVisible();
  expect(screen.queryByText(/No matching Ebay/)).not.toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("radio", { name: "Listed" }));
  rerender(<EbaySoldView response={{ sold: [], active: [] }} />);
  expect(screen.getByRole("radio", { name: "Listed" })).toBeChecked();
  expect(screen.getByText("No matching Ebay listings found.")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Search this card" }),
  ).not.toBeInTheDocument();
});

test("counts all matching results while displaying them in batches", () => {
  render(
    <EbaySoldView
      response={{
        sold: Array.from({ length: 20 }, (_, index) => listing(index + 1)),
        active: [],
      }}
    />,
  );
  expect(screen.getAllByRole("article")).toHaveLength(15);
  expect(screen.getByRole("status")).toHaveTextContent("Sold · 20 matches");
  expect(
    screen.queryByRole("button", { name: /Show \d+ more/ }),
  ).not.toBeInTheDocument();
});

test("clears all result filters from the shared clear-filter control", async () => {
  render(
    <EbaySoldView
      response={{
        sold: [
          { ...listing(1), title: "Pikachu PSA10" },
          { ...listing(2), title: "Charizard raw" },
        ],
        active: [],
      }}
    />,
  );

  expect(
    screen.queryByRole("button", { name: "Clear filters" }),
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("radio", { name: "Grade 10" }));
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Include keywords" }),
    { target: { value: "Pikachu" } },
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 1 match"),
  );
  const clearFilters = screen.getByRole("button", { name: "Clear filters" });

  fireEvent.click(clearFilters);

  expect(screen.getByRole("radio", { name: "All" })).toBeChecked();
  expect(
    screen.getByRole("searchbox", { name: "Include keywords" }),
  ).toHaveValue("");
  expect(screen.getByRole("status")).toHaveTextContent("Sold · 2 matches");
  expect(
    screen.queryByRole("button", { name: "Clear filters" }),
  ).not.toBeInTheDocument();
});

test("summarizes prices from the complete filtered result set using the median", async () => {
  render(
    <EbaySoldView
      response={{
        sold: [
          { ...listing(10), title: "Pikachu PSA 9" },
          { ...listing(20), title: "Pikachu PSA 10" },
          { ...listing(100), title: "Pikachu raw" },
        ],
        active: [],
      }}
    />,
  );

  expect(screen.getByLabelText("Sold price summary")).toHaveTextContent(
    "High$100.00Median$20.00Low$10.00",
  );

  fireEvent.change(
    screen.getByRole("searchbox", { name: "Include keywords" }),
    {
      target: { value: "PSA" },
    },
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Sold price summary")).toHaveTextContent(
      "High$20.00Median$15.00Low$10.00",
    ),
  );
});

test("shows a bid count when the listing has one", () => {
  render(
    <EbaySoldView
      response={{
        sold: [{ ...listing(1), bidCount: "14", condition: "Pre-Owned" }],
        active: [{ ...listing(2, "active"), bidCount: "1" }],
      }}
    />,
  );

  expect(screen.getByText("14 bids")).toBeVisible();
  expect(screen.queryByText("1 bid")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("radio", { name: "Listed" }));
  expect(screen.getByText("1 bid")).toBeVisible();
});

test("shows available listing details without a duplicate Buy It Now price", () => {
  render(
    <EbaySoldView
      initialListingType="active"
      response={{
        sold: [],
        active: [
          {
            ...listing(1, "active"),
            buyItNowPrice: "39.00",
            shippingType: "free",
            timeLeft: "2d 3h",
            watcherCount: "10",
          },
        ],
      }}
    />,
  );

  expect(screen.getByText("2d 3h left")).toBeVisible();
  expect(screen.getByText("Buy It Now $39.00")).toBeVisible();
  expect(screen.getByText("10 watching")).toBeVisible();
  expect(screen.getByText("Free shipping")).toBeVisible();
  expect(
    screen.queryByText(/Buy It Now Price unavailable/),
  ).not.toBeInTheDocument();
});

test("shows an offer accepted marker on a sold listing", () => {
  render(
    <EbaySoldView
      response={{
        sold: [{ ...listing(1), bestOfferAccepted: "true" }],
        active: [],
      }}
    />,
  );

  expect(screen.getByText("Offer accepted")).toBeVisible();
});

test("shows an available shipping price as the final metadata item", () => {
  render(
    <EbaySoldView
      initialListingType="active"
      response={{
        sold: [],
        active: [
          {
            ...listing(1, "active"),
            condition: "Pre-Owned",
            shippingCurrency: "USD",
            shippingPrice: "5.70",
          },
        ],
      }}
    />,
  );

  const metadata = screen.getByText("$5.70 shipping").parentElement;
  expect(metadata?.lastElementChild).toHaveTextContent("$5.70 shipping");
});

test("omits shipping metadata from sold results", () => {
  render(
    <EbaySoldView
      response={{
        sold: [
          {
            ...listing(1),
            shippingCurrency: "USD",
            shippingPrice: "5.70",
          },
          {
            ...listing(2),
            shippingType: "free",
          },
        ],
        active: [],
      }}
    />,
  );

  expect(screen.queryByText("$5.70 shipping")).not.toBeInTheDocument();
  expect(screen.queryByText("Free shipping")).not.toBeInTheDocument();
});

test("shows sold and listed results together in the wide advanced view", () => {
  const previousMatchMedia = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });

  try {
    render(
      <EbaySoldView
        response={{
          sold: [listing(1)],
          active: [listing(2, "active")],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Dual" }));

    expect(
      screen.getByRole("heading", { name: "Sold · 1 match" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Listed · 1 match" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "View sale" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Buy" })).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Expand all listings" }),
    );
    for (const row of screen.getAllByRole("article")) {
      expect(row).toHaveClass("ebay-sold-view__result--expanded");
    }
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse all listings" }),
    );
    for (const row of screen.getAllByRole("article")) {
      expect(row).not.toHaveClass("ebay-sold-view__result--expanded");
    }
  } finally {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: previousMatchMedia,
    });
  }
});

test("keeps a pending dual-view panel visible with a loading spinner", () => {
  const previousMatchMedia = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });

  try {
    const { rerender } = render(
      <EbaySoldView
        listingStates={{ sold: "success", active: "pending" }}
        response={{ sold: [listing(1)] }}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Dual" }));

    expect(screen.getByRole("heading", { name: "Listed" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: /Listed · .* matches/ }),
    ).not.toBeInTheDocument();
    const loading = screen.getByRole("status", {
      name: "Loading listed Ebay results",
    });
    expect(loading.querySelector(".app-loading-spinner")).toBeInTheDocument();
    expect(
      screen.queryByText("No matching Ebay listings found."),
    ).not.toBeInTheDocument();

    rerender(
      <EbaySoldView
        listingStates={{ sold: "success", active: "success" }}
        response={{ sold: [listing(1)], active: [] }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Listed · 0 matches" }),
    ).toBeVisible();
    expect(screen.getByText("No matching Ebay listings found.")).toBeVisible();
  } finally {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: previousMatchMedia,
    });
  }
});

test("expands and collapses an overflowing listing title", () => {
  const clientWidth = vi
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockReturnValue(100);
  const scrollWidth = vi
    .spyOn(HTMLElement.prototype, "scrollWidth", "get")
    .mockReturnValue(200);

  try {
    render(<EbaySoldView response={{ sold: [listing(1)], active: [] }} />);

    const toggle = screen.getByRole("button", {
      name: "Expand listing title",
    });
    const titleBlock = toggle.closest(".ebay-sold-view__title-block");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(titleBlock).toHaveClass("ebay-sold-view__title-block--expanded");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(titleBlock).not.toHaveClass("ebay-sold-view__title-block--expanded");
  } finally {
    clientWidth.mockRestore();
    scrollWidth.mockRestore();
  }
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
  expect(screen.getByRole("status")).toHaveTextContent("Sold · 2 matches");
  fireEvent.click(screen.getByRole("radio", { name: "Listed" }));
  expect(screen.getAllByRole("link", { name: "Buy" })).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent("Listed · 1 match");
  fireEvent.click(screen.getByRole("radio", { name: "Sold" }));
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Include keywords" }),
    {
      target: { value: "stamped" },
    },
  );
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
  expect(
    screen.getByRole("heading", { name: "Pikachu Stamped" }),
  ).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(/^Sold · 1 match$/);

  fireEvent.change(
    screen.getByRole("searchbox", { name: "Include keywords" }),
    { target: { value: "missing" } },
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 0 matches"),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Clear included keywords" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 2 matches"),
  );
});

test("includes half grades in the matching whole-grade filter", async () => {
  render(
    <EbaySoldView
      response={{
        sold: [
          { ...listing(1), title: "Pikachu PSA 8" },
          { ...listing(2), title: "Pikachu BGS 8.5" },
          { ...listing(3), title: "Pikachu CGC 9.5" },
        ],
        active: [],
      }}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Grade 8" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 2 matches"),
  );
  expect(screen.getByRole("heading", { name: "Pikachu Psa 8" })).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Pikachu Bgs 8.5" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Pikachu Cgc 9.5" }),
  ).not.toBeInTheDocument();
});

test("treats decimal whole grades as their matching whole-grade filter", async () => {
  render(
    <EbaySoldView
      response={{
        sold: [
          { ...listing(4), title: "Pikachu PSA 6.0" },
          { ...listing(1), title: "Pikachu PSA 7.0" },
          { ...listing(2), title: "Pikachu CGC 8.0" },
          { ...listing(3), title: "Pikachu BGS 9.0" },
        ],
        active: [],
      }}
    />,
  );

  for (const [grade, title] of [
    ["Grade 6", "Pikachu Psa 6.0"],
    ["Grade 7", "Pikachu Psa 7.0"],
    ["Grade 8", "Pikachu Cgc 8.0"],
    ["Grade 9", "Pikachu Bgs 9.0"],
  ]) {
    fireEvent.click(screen.getByRole("radio", { name: grade }));
    await waitFor(() => {
      const resultHeadings = screen.getAllByRole("heading", { level: 3 });
      expect(resultHeadings).toHaveLength(1);
      expect(resultHeadings[0]).toHaveAccessibleName(title);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 1 match");
  }
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
  expect(screen.getByRole("status")).toHaveTextContent("Sold · 2 matches");
  fireEvent.click(screen.getByRole("radio", { name: "Grade 10" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(/^Sold · 1 match$/),
  );
  expect(screen.getAllByRole("article")).toHaveLength(1);
});

test("filters by grading company independently from included keywords", async () => {
  render(
    <EbaySoldView
      response={{
        sold: [
          { ...listing(1), title: "Pikachu PSA 10" },
          { ...listing(2), title: "Pikachu CGC 10" },
          { ...listing(3), title: "Pikachu Beckett 9.5 special" },
          { ...listing(4), title: "Pikachu BGS 9 regular" },
          { ...listing(5), title: "Pikachu SGC 10" },
          { ...listing(6), title: "Pikachu raw" },
        ],
        active: [],
      }}
    />,
  );

  const graderFilter = screen.getByRole("button", {
    name: "Filter by grading company",
  });
  expect(graderFilter).toHaveTextContent("All companies");

  fireEvent.click(graderFilter);
  fireEvent.click(screen.getByRole("option", { name: "PSA" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 1 match"),
  );

  fireEvent.click(graderFilter);
  fireEvent.click(screen.getByRole("option", { name: "Beckett / BGS" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 2 matches"),
  );
  expect(screen.getByText("Beckett", { selector: "mark" })).toBeVisible();
  expect(screen.getByText("Bgs", { selector: "mark" })).toBeVisible();

  const includeFilter = screen.getByRole("searchbox", {
    name: "Include keywords",
  });
  fireEvent.change(includeFilter, { target: { value: "special" } });
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 1 match"),
  );
  expect(includeFilter).toHaveValue("special");
  expect(graderFilter).toHaveTextContent("Beckett / BGS");

  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(includeFilter).toHaveValue("");
  expect(graderFilter).toHaveTextContent("All companies");
  expect(screen.getByRole("status")).toHaveTextContent("Sold · 6 matches");
});

test("recognizes TAG grading names without matching Tag Team titles", async () => {
  render(
    <EbaySoldView
      response={{
        sold: [
          { ...listing(1), title: "Umbreon TAG10" },
          { ...listing(2), title: "Umbreon TAG Grading 9" },
          { ...listing(3), title: "Umbreon TAG Grading" },
          { ...listing(4), title: "Umbreon TAG Pristine" },
          { ...listing(5), title: "Pikachu & Zekrom GX Tag Team 33/181" },
          { ...listing(6), title: "Umbreon raw" },
        ],
        active: [],
      }}
    />,
  );

  const graderFilter = screen.getByRole("button", {
    name: "Filter by grading company",
  });
  fireEvent.click(graderFilter);
  fireEvent.click(screen.getByRole("option", { name: "TAG" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 4 matches"),
  );
  expect(screen.getAllByText("Tag", { selector: "mark" })).toHaveLength(4);
  expect(
    screen.queryByRole("heading", {
      name: "Pikachu & Zekrom Gx Tag Team 33/181",
    }),
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("radio", { name: "Grade 10" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 2 matches"),
  );
  expect(screen.getByRole("heading", { name: "Umbreon Tag10" })).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Umbreon Tag Pristine" }),
  ).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getAllByRole("article")).toHaveLength(6);
});

test("Grade 6 replaces Raw and includes whole and half grades without matching card numbers", async () => {
  render(
    <EbaySoldView
      response={{
        sold: [
          { ...listing(1), title: "Pikachu PSA 6" },
          { ...listing(2), title: "Pikachu CGC 6.5" },
          { ...listing(3), title: "Pikachu EX-MT 6" },
          { ...listing(4), title: "Pikachu raw 6/102" },
          { ...listing(5), title: "Pikachu PSA 7" },
        ],
        active: [],
      }}
    />,
  );
  expect(screen.queryByRole("radio", { name: "Raw" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "Grade 6" }));
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));
  expect(screen.getByRole("heading", { name: "Pikachu Psa 6" })).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Pikachu Cgc 6.5" }),
  ).toBeVisible();
  expect(screen.getByText("Psa 6", { selector: "mark" })).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Pikachu Raw 6/102" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "All" }));
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(5));
});

test("retains available results when the other provider request failed", () => {
  render(<EbaySoldView response={{ sold: [listing(1)], active: null }} />);
  expect(screen.getByRole("link", { name: "View sale" })).toBeVisible();
  fireEvent.click(screen.getByRole("radio", { name: "Listed" }));
  expect(
    screen.queryByText(/load these Ebay listings/),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/No matching Ebay/)).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("marks the matching grade phrase without marking the set number", async () => {
  render(
    <EbaySoldView
      response={{
        sold: [
          {
            ...listing(1),
            title: "Charizard 4/102 Base Set PSA 8.5 Holo",
          },
          {
            ...listing(2),
            title: "Charizard 4/102 Base Set",
          },
        ],
        active: [],
      }}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Grade 8" }));
  const mark = await screen.findByText("Psa 8.5", { selector: "mark" });
  const title = mark.closest("h3");
  expect(title).toHaveAccessibleName("Charizard 4/102 Base Set Psa 8.5 Holo");
  expect(title?.textContent).toContain("4/102");
  expect(title?.querySelectorAll("mark")).toHaveLength(1);
});

test("marks included keyword phrases in the listing title", async () => {
  render(
    <EbaySoldView
      response={{
        sold: [{ ...listing(1), title: "Pikachu PSA 10 stamped" }],
        active: [],
      }}
    />,
  );
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Include keywords" }),
    { target: { value: "psa 10" } },
  );
  const mark = await screen.findByText("Psa 10", { selector: "mark" });
  expect(mark.closest("h3")).toHaveAccessibleName("Pikachu Psa 10 Stamped");
  expect(mark.closest("h3")?.querySelectorAll("mark")).toHaveLength(1);

  fireEvent.change(
    screen.getByRole("searchbox", { name: "Exclude keywords" }),
    { target: { value: "stamped" } },
  );
  expect(screen.getByText("Psa 10", { selector: "mark" })).toBeVisible();
  expect(screen.getAllByText("Psa 10", { selector: "mark" })).toHaveLength(1);
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
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Include keywords" }),
    {
      target: { value: "pikachu" },
    },
  );
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Exclude keywords" }),
    {
      target: { value: "STAMPED" },
    },
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(/^Sold · 1 match$/),
  );
  expect(
    screen.getByRole("heading", { name: "Pikachu Psa 10 Regular" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("radio", { name: "Listed" }));
  expect(screen.getAllByRole("link", { name: "Buy" })).toHaveLength(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Clear excluded keywords" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Listed · 2 matches"),
  );
});

test("shows keyword help independently for each empty filter", () => {
  render(<EbaySoldView response={{ sold: [listing(1)] }} />);

  const excludeHelp = screen.getByRole("button", {
    name: "How excluded keywords work",
  });
  const includeHelp = screen.getByRole("button", {
    name: "How included keywords work",
  });
  expect(excludeHelp).toBeVisible();
  expect(includeHelp).toBeVisible();
  expect(excludeHelp).toHaveAccessibleDescription(
    expect.stringContaining("Results are excluded"),
  );
  expect(includeHelp).toHaveAccessibleDescription(
    expect.stringContaining("Results must match all words"),
  );

  fireEvent.change(
    screen.getByRole("searchbox", { name: "Include keywords" }),
    { target: { value: "psa" } },
  );
  expect(excludeHelp).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "How included keywords work" }),
  ).not.toBeInTheDocument();

  fireEvent.change(
    screen.getByRole("searchbox", { name: "Exclude keywords" }),
    { target: { value: "reverse holo" } },
  );
  expect(
    screen.queryByRole("button", { name: "How excluded keywords work" }),
  ).not.toBeInTheDocument();
});

test("exclusion resets pagination and ignores queries shorter than two characters", async () => {
  render(
    <EbaySoldView
      response={{
        sold: Array.from({ length: 20 }, (_, index) => listing(index + 1)),
      }}
    />,
  );
  const exclude = screen.getByRole("searchbox", {
    name: "Exclude keywords",
  });
  fireEvent.change(exclude, { target: { value: "p" } });
  expect(screen.getByRole("status")).toHaveTextContent("Sold · 20 matches");
  fireEvent.change(exclude, { target: { value: "missing" } });
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(15));
  expect(screen.getByRole("status")).toHaveTextContent("Sold · 20 matches");
  fireEvent.change(exclude, { target: { value: "pikachu" } });
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 0 matches"),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Clear excluded keywords" }),
  );
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(15));
  expect(screen.getByRole("status")).toHaveTextContent("Sold · 20 matches");
});
