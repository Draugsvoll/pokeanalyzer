import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, test, vi } from "vitest";
import EbaySoldView from "./EbaySoldView";

function gradeOption(options: { name: string | RegExp }) {
  const toggle = screen.getByRole("button", { name: "Filter by grade" });
  if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
  return screen.getByRole("option", options);
}

function listing(index: number, listingType = "sold") {
  return {
    title: `Pikachu listing ${index}`,
    listingType,
    soldPrice: String(Math.max(2, index)),
    soldCurrency: "USD",
    currentPrice: String(Math.max(2, index)),
    currentCurrency: "USD",
    endedAt: `2026-10-${String(index).padStart(2, "0")}`,
    url: `https://www.ebay.com/itm/${index}`,
  };
}

test("counts grades 1–10 across all fetched rows without counting All or narrowing other grade counts", async () => {
  render(
    <EbaySoldView
      response={{
        sold: [
          ...Array.from({ length: 10 }, (_, index) => ({
            ...listing(index + 1),
            title: `Pikachu PSA ${index + 1}`,
          })),
          { ...listing(11), title: "Pikachu BGS 9.5" },
          ...Array.from({ length: 10 }, (_, index) => ({
            ...listing(index + 12),
            title: "Pikachu PSA 10",
          })),
          { ...listing(22), title: "Pikachu unspecified" },
          { ...listing(23), title: "Pikachu PSA 4", soldPrice: "1" },
        ],
        active: [],
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Filter by grade" }));
  expect(screen.getByRole("option", { name: "All grades" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  for (let grade = 1; grade <= 8; grade++) {
    expect(
      screen.getByRole("option", { name: `Grade ${grade} (1)` }),
    ).toBeVisible();
  }
  expect(screen.getByRole("option", { name: "Grade 10 (11)" })).toBeVisible();
  fireEvent.click(screen.getByRole("option", { name: "Grade 9 (2)" }));
  expect(
    screen.getByRole("button", { name: "Filter by grade" }),
  ).toHaveTextContent(/^Grade 9$/);
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
  fireEvent.click(screen.getByRole("button", { name: "Filter by grade" }));
  expect(screen.getByRole("option", { name: "Grade 10 (11)" })).toBeVisible();
  fireEvent.click(screen.getByRole("option", { name: "All grades" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("22 results"),
  );
});

test("always uses a grade dropdown regardless of the available grades", () => {
  const results = Array.from({ length: 5 }, (_, index) => ({
    ...listing(index + 1),
    title: `Pikachu PSA ${index + 1}`,
  }));
  const { rerender } = render(
    <EbaySoldView response={{ sold: results.slice(0, 4), active: [] }} />,
  );
  expect(gradeOption({ name: "Grade 4 (1)" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Filter by grade" })).toBeVisible();
  rerender(<EbaySoldView response={{ sold: results, active: [] }} />);
  expect(gradeOption({ name: "Grade 5 (1)" })).toBeVisible();
});

test("keyword filters change results without changing grade or company options, counts or selections", async () => {
  render(
    <EbaySoldView
      response={{
        sold: [
          { ...listing(1), title: "Pikachu PSA 9 special" },
          { ...listing(2), title: "Pikachu CGC 10 special" },
          { ...listing(3), title: "Pikachu CGC 10 regular" },
        ],
        active: [],
      }}
    />,
  );
  expect(
    screen.queryByRole("option", { name: /^Grade 8/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(gradeOption({ name: "Grade 9 (1)" }));
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
  fireEvent.click(
    screen.getByRole("button", { name: "Filter by grading company" }),
  );
  expect(screen.getByRole("option", { name: "CGC (2)" })).toBeVisible();
  expect(screen.getByRole("option", { name: "PSA (1)" })).toBeVisible();
  fireEvent.click(screen.getByRole("option", { name: "All companies" }));
  fireEvent.click(gradeOption({ name: "All grades" }));
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));
  fireEvent.click(
    screen.getByRole("button", { name: "Filter by grading company" }),
  );
  fireEvent.click(screen.getByRole("option", { name: "CGC (2)" }));
  expect(
    screen.getByRole("button", { name: "Filter by grading company" }),
  ).toHaveTextContent(/^CGC$/);
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
  expect(gradeOption({ name: "Grade 9 (1)" })).toBeVisible();
  expect(gradeOption({ name: "Grade 10 (2)" })).toBeVisible();
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Include keywords" }),
    { target: { value: "special" } },
  );
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
  expect(gradeOption({ name: "Grade 9 (1)" })).toBeVisible();
  fireEvent.click(gradeOption({ name: "Grade 10 (2)" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "false"),
  );
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Exclude keywords" }),
    { target: { value: "special" } },
  );
  await waitFor(() => expect(screen.queryAllByRole("article")).toHaveLength(0));
  expect(
    screen.getByRole("button", { name: "Filter by grade" }),
  ).toHaveTextContent(/^Grade 10$/);
  expect(
    screen.getByRole("button", { name: "Filter by grading company" }),
  ).toHaveTextContent(/^CGC$/);
  expect(gradeOption({ name: "Grade 9 (1)" })).toBeVisible();
  expect(gradeOption({ name: "Grade 10 (2)" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Filter by grade" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Filter by grading company" }),
  );
  expect(screen.getByRole("option", { name: "CGC (2)" })).toBeVisible();
  expect(screen.getByRole("option", { name: "PSA (1)" })).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Filter by grading company" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Clear excluded keywords" }),
  );
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
  fireEvent.click(
    screen.getByRole("button", { name: "Clear included keywords" }),
  );
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
  expect(
    screen.getByRole("button", { name: "Filter by grade" }),
  ).toHaveTextContent(/^Grade 10$/);
  expect(
    screen.getByRole("button", { name: "Filter by grading company" }),
  ).toHaveTextContent(/^CGC$/);
});

test("grade counts follow Sold/Listed in Single view and combine both in Dual view independently of keywords", async () => {
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
          sold: [{ ...listing(1), title: "Pikachu PSA 9" }],
          active: [
            { ...listing(2, "active"), title: "Pikachu PSA 10" },
            { ...listing(3, "active"), title: "Pikachu PSA 9" },
          ],
        }}
      />,
    );
    expect(gradeOption({ name: "Grade 9 (1)" })).toBeVisible();
    expect(
      screen.queryByRole("option", { name: /^Grade 10/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Listed" }));
    expect(gradeOption({ name: "Grade 10 (1)" })).toBeVisible();
    fireEvent.click(
      within(
        screen.getByRole("radiogroup", { name: "Ebay listing type" }),
      ).getByRole("radio", { name: "All" }),
    );
    expect(gradeOption({ name: "Grade 9 (2)" })).toBeVisible();
    expect(gradeOption({ name: "Grade 10 (1)" })).toBeVisible();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Include keywords" }),
      {
        target: { value: "missing" },
      },
    );
    await waitFor(() =>
      expect(screen.queryAllByRole("article")).toHaveLength(0),
    );
    expect(gradeOption({ name: "Grade 9 (2)" })).toBeVisible();
    expect(gradeOption({ name: "Grade 10 (1)" })).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Clear included keywords" }),
    );
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Exclude keywords" }),
      {
        target: { value: "pikachu" },
      },
    );
    await waitFor(() =>
      expect(screen.queryAllByRole("article")).toHaveLength(0),
    );
    expect(gradeOption({ name: "Grade 9 (2)" })).toBeVisible();
    expect(gradeOption({ name: "Grade 10 (1)" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Filter by grade" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Filter by grading company" }),
    );
    expect(screen.getByRole("option", { name: "PSA (3)" })).toBeVisible();
  } finally {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: previousMatchMedia,
    });
  }
});

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
  expect(
    screen.queryByRole("option", { name: /^Grade 10 [(]/ }),
  ).not.toBeInTheDocument();
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
  expect(screen.getByRole("status")).toHaveTextContent("Sold · 20 results");
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

  fireEvent.click(gradeOption({ name: /^Grade 10 [(]/ }));
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Include keywords" }),
    { target: { value: "Pikachu" } },
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 1 result"),
  );
  const clearFilters = screen.getByRole("button", { name: "Clear filters" });

  fireEvent.click(clearFilters);

  expect(
    screen.getByRole("button", { name: "Filter by grade" }),
  ).toHaveTextContent(/^All grades$/);
  expect(
    screen.getByRole("searchbox", { name: "Include keywords" }),
  ).toHaveValue("");
  expect(screen.getByRole("status")).toHaveTextContent("Sold · 2 results");
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
    fireEvent.click(
      within(
        screen.getByRole("radiogroup", { name: "Ebay listing type" }),
      ).getByRole("radio", { name: "All" }),
    );

    expect(
      screen.getByRole("heading", { name: "Sold · 1 result" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Listed · 1 result" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "View sale" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Buy" })).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Expand all listings" }),
    );
    for (const row of screen.getAllByRole("article")) {
      expect(row).toHaveClass("marketplace-listings__result--expanded");
    }
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse all listings" }),
    );
    for (const row of screen.getAllByRole("article")) {
      expect(row).not.toHaveClass("marketplace-listings__result--expanded");
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
    fireEvent.click(
      within(
        screen.getByRole("radiogroup", { name: "Ebay listing type" }),
      ).getByRole("radio", { name: "All" }),
    );

    expect(screen.getByRole("heading", { name: "Listed" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: /Listed · .* results/ }),
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
      screen.getByRole("heading", { name: "Listed · 0 results" }),
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
    const titleBlock = toggle.closest(".marketplace-listings__title-block");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(titleBlock).toHaveClass(
      "marketplace-listings__title-block--expanded",
    );

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(titleBlock).not.toHaveClass(
      "marketplace-listings__title-block--expanded",
    );
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
  expect(screen.getByRole("status")).toHaveTextContent("Sold · 2 results");
  fireEvent.click(screen.getByRole("radio", { name: "Listed" }));
  expect(screen.getAllByRole("link", { name: "Buy" })).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent("Listed · 1 result");
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
  expect(screen.getByRole("status")).toHaveTextContent(/^Sold · 1 result$/);

  fireEvent.change(
    screen.getByRole("searchbox", { name: "Include keywords" }),
    { target: { value: "missing" } },
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 0 results"),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Clear included keywords" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 2 results"),
  );
});

test.each([
  ["PSA 1st Edition Gem Mint 10", "1", "10"],
  ["BGS 2nd Edition Mint 9", "2", "9"],
  ["CGC 3rd Edition Gem Mint 10", "3", "10"],
  ["SGC 4th Edition Mint 9", "4", "9"],
  ["TAG 1st Edition Gem Mint 10", "1", "10"],
  ["PSA 10th Anniversary Mint 9", "10", "9"],
  ["PSA1st Edition Gem Mint 10", "1", "10"],
  ["PSA 1stEdition Gem Mint 10", "1", "10"],
  ["BGS 2ndEdition Mint 9", "2", "9"],
  ["CGC 3rdEdition Gem Mint 10", "3", "10"],
  ["SGC 4thEdition Mint 9", "4", "9"],
  ["PSA 1st Edition Charizard #4 Gem Mint 10", "4", "10"],
  ["PSA 1st Edition Charizard 4 Gem Mint 10", "4", "10"],
  ["PSA 1st Edition Charizard 4 of 102 Gem Mint 10", "4", "10"],
])(
  "does not count ordinal numbers as grades in %s",
  async (title, ordinal, grade) => {
    render(
      <EbaySoldView
        response={{
          sold: [
            { ...listing(1), title: `Pikachu ${title}` },
            { ...listing(2), title: `Pikachu PSA ${ordinal}` },
          ],
          active: [],
        }}
      />,
    );
    expect(gradeOption({ name: `Grade ${grade} (1)` })).toBeVisible();
    fireEvent.click(gradeOption({ name: `Grade ${grade} (1)` }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
    expect(
      screen.queryByRole("heading", { name: `Pikachu Psa ${ordinal}` }),
    ).not.toBeInTheDocument();
    fireEvent.click(gradeOption({ name: `Grade ${ordinal} (1)` }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
    expect(
      await screen.findByRole("heading", { name: `Pikachu Psa ${ordinal}` }),
    ).toBeVisible();
  },
);

test.each(
  [
    "PSA",
    "BGS",
    "CGC",
    "SGC",
    "Beckett",
    "TAG",
    "ACE",
    "GMA",
    "MGC",
    "AOG",
    "HGA",
    "JCA",
    "LCC",
    "PCG",
    "AGS",
    "CGA",
    "GEMIX",
    "Professional Sports Authenticator",
    "Certified Guaranty Company",
    "Sportscard Guaranty Corporation",
  ].flatMap((company) =>
    Array.from({ length: 10 }, (_, index) => [company, index + 1] as const),
  ),
)("recognizes %s grade %i without counting other grades", (company, grade) => {
  render(
    <EbaySoldView
      response={{
        sold: [{ ...listing(1), title: `Pikachu ${company} ${grade}` }],
        active: [],
      }}
    />,
  );
  expect(gradeOption({ name: `Grade ${grade} (1)` })).toBeVisible();
  expect(screen.getAllByRole("option")).toHaveLength(2);
});

test.each([
  ["PSA10", 10],
  ["psa-9.5", 9],
  ["CGCGEMMINT10", 10],
  ["CGC Gem Mint 10", 10],
  ["BGS Black Label 10", 10],
  ["Beckett Pristine 10", 10],
  ["Pristine 10", 10],
  ["Charizard Pristine-10", 10],
  ["Charizard Gem Mint 10", 10],
  ["Pristine 10 Charizard CGC", 10],
  ["Pristine 10 JVA", 10],
  ["Pristine 10 CGCfake", 10],
  ["Pristine 10 CGC", 10],
  ["Gem Mint 8 PSA", 8],
  ["Gem 8 PSA", 8],
  ["Mint 8 BGS", 8],
  ["Near Mint 8 CGC", 8],
  ["Black Label 10 BGS", 10],
  ["Perfect 10 ACE", 10],
  ["Pristine 9.5 CGC", 9],
  ["Pristine-10-CGC", 10],
  ["Pristine 10 Certified Guaranty Company", 10],
  [
    "Pokémon Graded N's Zoroark ex 185 Journey Together SIR Pristine 10 CGC English",
    10,
  ],
  ["SGC8.5", 8],
  ["TAG Pristine", 10],
  ["TAG Grading 9", 9],
  ["TAG10", 10],
  ["PSA 1.5", 1],
  ["PSA 10.0", 10],
  ["BGS 9 . 5", 9],
  ["Grade 4", 4],
  ["4 Graded", 4],
  ["Slabbed 3", 3],
  ["Certified 5", 5],
  ["NM-MT 8", 8],
  ["Near Mint Mint 8.5", 8],
  ["Near Mint 7", 7],
  ["EX-MT 6", 6],
  ["Mint 9", 9],
  ["Gem-MT 10", 10],
  ["PSA 1 Star", 1],
  ["PSA 10 The Movie", 10],
  ["PSA 10 1st Edition Charizard #4", 10],
  ["1st Edition Charizard #4 PSA 10", 10],
  ["PSA 1stEdition Charizard #4 Gem Mint 10", 10],
  ["Charizard #4 PSA 10", 10],
  ["Charizard 4 PSA Gem Mint 10", 10],
  ["Charizard 4 CGC Pristine 10", 10],
  ["Charizard #4 BGS Black Label 10", 10],
  ["PSA 8 2025 N's Zoroark ex 185/159", 8],
  ["PSA 10 #185/159 N's Zoroark ex", 10],
  ["PSA 9 (1999) Charizard Base Set", 9],
  ["PSA10 #12345678 Charizard", 10],
  ["Charizard PSA 10 280 HP", 10],
  ["PSA 10 2x Charizard", 10],
  ["PSA-10 GEM MINT Charizard #4/102", 10],
  ["Charizard (PSA 10) GEM MT", 10],
  ["CGC 9.5 Mint+ Charizard 4/102", 9],
  ["CGC Pristine 10 Charizard 4/102", 10],
  ["BGS 9.5 Gold Label Charizard", 9],
  ["SGC 10 GEM MINT Charizard", 10],
  ["TAGGEMMINT10 Charizard", 10],
  ["TAG GEM MINT 10 Charizard", 10],
  ["TAG 9 2025 N's Zoroark ex", 9],
  ["ACE10 Charizard", 10],
  ["GMA 10 Charizard", 10],
  ["HGA 9.5 Charizard", 9],
  ["Charizard PSA 9 OC", 9],
  ["Charizard PSA 9 (MINT) Cert #12345678", 9],
  ["PSA 10 Pop 4 Charizard", 10],
  ["PSA 10 Potential investment Charizard", 10],
  ["Not only PSA 10 Charizard", 10],
  ["PSA 10 not sure of set Charizard", 10],
  ["PSA9.5Mint Charizard", 9],
  ["PSA PR 1 Charizard", 1],
  ["PSA FR 1.5 Charizard", 1],
  ["PSA GD 2 Charizard", 2],
  ["PSA VG 3 Charizard", 3],
  ["PSA VG-EX 4 Charizard", 4],
  ["PSA EX 5 Charizard", 5],
  ["PSA EX-MT 6 Charizard", 6],
  ["PSA NM 7 Charizard", 7],
  ["PSA NM-MT 8 Charizard", 8],
  ["Charizard PSA 10 - 2025 Pokemon", 10],
  ["Charizard BGS 9.5 - 1999 Pokemon", 9],
  ["Charizard PSA10-2025 Pokemon", 10],
  ["Charizard PSA10-1stEdition", 10],
  ["Charizard PSA 10 - 1st Edition", 10],
  ["Charizard PSA 9 - 2nd Edition", 9],
  ["Charizard CGC 8.5-3rd Edition", 8],
  ["Charizard PSA 7\u20134th Edition", 7],
  ["Greninja PSA 10 - 25th Anniversary", 10],
  ["Charizard PSA 9.5-1st Edition", 9],
  ["Charizard PSA 10-1st Edition #4/102", 10],
  ["Charizard PSA 10 \u2013 2025 Pokemon", 10],
  ["PSA 10/10 Charizard", 10],
  ["PSA10/10 Charizard", 10],
  ["BGS 9.5/10 Charizard", 9],
  ["PSA-8/10 Charizard", 8],
  ["PSA GEM MINT 10 / 10 Charizard", 10],
  ["PSA GEM 10 Charizard", 10],
  ["PSAGEM10 Charizard", 10],
  ["CGC GEM 9.5 Charizard", 9],
  ["BGS Gem 9 Charizard", 9],
  ["PSA New GEM 10 Charizard", 10],
  [
    "2025 Pokémon JTG EN N’S Zoroark ex Special Illustration Rare #185 PSA GEM 10",
    10,
  ],
  ["PSA New 9 Charizard", 9],
  ["CGC Old MINT 8.5 Charizard", 8],
  ["TAG New Pristine 10 Charizard", 10],
  ["TAG Old Pristine Charizard", 10],
  ["JCA Old GEM MINT 10 Charizard", 10],
  ["PCG New 9 Charizard", 9],
  ["CGC New Mint 8.5/10 Charizard", 8],
  ["Charizard 4 CGC New Mint 8.5", 8],
  // Real title formats from the saved eBay response, kept as fixed fixtures.
  ["2025 Pokemon Journey Together N's Zoroark ex SIR PSA 9 #185/159", 9],
  [
    "Pokemon Company PSA 8 2025 Sv09 Journey Together N's Zoroark ex 185/159 SIR",
    8,
  ],
  ["N's Zoroark ex 185/159 Sv09: Journey Together SIR Holo PSA 10 2025 EN", 10],
  [
    "Pokemon Journey Together N's Zoroark ex Special Illustration Rare PSA 9 #185/159",
    9,
  ],
  ["PSA 9 2025 N'S ZOROARK EX 185/159 JOURNEY TOGETHER", 9],
  ["N's Zoroark ex PSA 10 2025 Pokemon Journey Together #185/159 8195", 10],
  ["The Pokemon Company N's Zoroark ex 185/159 Sv09 SIR Holo EN PSA 9 2025", 9],
  [
    "The Pokemon Company N's Zoroark ex Sv09: Journey Together SIR Holo PSA 9 185/159",
    9,
  ],
  ["N's Zoroark ex PSA 9 185/159 Sv09: Journey Together SIR Holo English", 9],
  [
    "2025 Journey Together N's Zoroark ex Special Illustration Rare SGC 9 #185",
    9,
  ],
])("keeps the valid grade in %s", (title, grade) => {
  render(
    <EbaySoldView
      response={{ sold: [{ ...listing(1), title }], active: [] }}
    />,
  );
  expect(gradeOption({ name: `Grade ${grade} (1)` })).toBeVisible();
  expect(screen.getAllByRole("option")).toHaveLength(2);
});

test.each([
  "Charizard #4",
  "9 PSA",
  "9 PSA 2025 Pikachu",
  "9 PSA 1st Edition",
  "9 PSA Mint",
  "10PSA",
  "Lot of 9 PSA Graded Charizard Cards",
  "Charizard 4 PSA Authentic",
  "Pokémon Graded N's Zoroark ex 185/159 Journey Together 10 CGC English",
  "Pristine #10",
  "Pristine 10/102",
  "Pristine 10th Anniversary",
  "Pristine 100",
  "Pristine 10.5",
  "Pristine 9",
  "Gem Mint #10",
  "Gem Mint 10/102",
  "Gem Mint 10th Anniversary",
  "Gem Mint 100",
  "Gem Mint 10.5",
  "Gem 10",
  "Pristine #10 CGC",
  "Pristine 10/102 CGC",
  "Pristine 10th CGC",
  "Pristine 100 CGC",
  "Pristine 10.5 CGC",
  "Pikachu 4/102",
  "Pikachu 280 HP",
  "Pikachu PSA certification 12345678",
  "PSA 1st Edition Charizard #4",
  "PSA 1stEdition Charizard #4",
  "BGS 2nd Edition Charizard 4",
  "CGC 3rdEdition Pikachu 8/102",
  "SGC 4th Edition Charizard #4",
  "PSA 10th Anniversary Pikachu #9",
  "Pikachu Tag Team 10/102",
  "PSA Charizard #4",
  "PSA Charizard 4",
  "PSA Charizard 4/102",
  "PSA10/102 Charizard",
  "Charizard # 4 PSA",
  "PSA 9.5th Anniversary Pikachu",
  "PSA 9.25 Charizard",
  "PSA 10.5 Charizard",
  "PSA 0 Charizard",
  "PSA 11 Charizard",
  "PSA Authentic Charizard",
  "BGS Authentic Altered Charizard",
  "PSA 1-10 Charizard",
  "PSA 9-10 Charizard",
  "PSA 9-10.",
  "PSA 9-9.5 Charizard",
  "PSA 8.5-9.5 Charizard",
  "PSA 1-9.5 Charizard",
  "PSA 4/102.",
  "PSA 4/102.5 Charizard",
  "PSA 9/1020 Charizard",
  "PSA 9\u201310 Charizard",
  "PSA 10/102 Charizard",
  "PSA 10th Anniversary Mint #9",
  "CGC New Charizard #4",
  "CGC Old Charizard 4",
  "JCA New 1st Edition Charizard #4",
  "LCC Old 2nd Edition Charizard 4/102",
  "New Greninja 130 HP Old SWSH144",
  "AGS 10th Anniversary Greninja #9",
  "JVA 9-10 Greninja",
  "PSA Gem Charizard 4",
  "PSA GEM #4 Charizard",
  "PSA GEM 10/102 Charizard",
  "PSA GEM 1st Edition Charizard #4",
  "Greninja Gem 10",
  "PSA Gemstone 10 Charizard",
])(
  "does not infer a grade from card numbers or ordinal wording in %s",
  (title) => {
    render(
      <EbaySoldView
        response={{ sold: [{ ...listing(1), title }], active: [] }}
      />,
    );
    gradeOption({ name: "All grades" });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getAllByRole("article")).toHaveLength(1);
  },
);

test("does not recognize JVA as a grading company or infer a grade from JVA 10", () => {
  render(
    <EbaySoldView
      response={{
        sold: [
          {
            ...listing(1),
            title:
              "Pokemon SWSH Black Star Promos Greninja Gold 2021 #SWSH144 JVA 10 (87)",
          },
        ],
        active: [],
      }}
    />,
  );
  gradeOption({ name: "All grades" });
  expect(screen.getAllByRole("option")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Filter by grade" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Filter by grading company" }),
  );
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(screen.getByRole("option", { name: "All companies" })).toBeVisible();
  expect(screen.getAllByRole("article")).toHaveLength(1);
});

test.each([
  ["CGC 9 Charizard not PSA 10", [9]],
  ["PSA 9 Charizard NOT PSA 10", [9]],
  ["CGC 9.5 Charizard PSA 10 candidate", [9]],
  ["CGC 9 Charizard not a PSA 10", [9]],
  ["CGC 9 Charizard non-PSA 10", [9]],
  ["CGC 9 Charizard no PSA 10", [9]],
  ["CGC 9 Charizard not PSA GEM MINT 10", [9]],
  ["CGC 9 Charizard potential PSA 10", [9]],
  ["CGC 9 Charizard possible PSA 10", [9]],
  ["CGC 9 Charizard PSA 10 contender", [9]],
  ["PSA 10 Charizard not PSA 9", [10]],
  ["Not PSA 10 Charizard", []],
  ["Charizard PSA 10 candidate", []],
  ["Potential PSA 10 Charizard", []],
  ["Possible PSA GEM MINT 10 Charizard", []],
  ["PSA 8 / PSA 9 Charizard pair", [8, 9]],
  ["Charizard PSA 10 BGS 9.5 pair", [9, 10]],
  ["CGC 9 Greninja not AGS New GEM MINT 10", [9]],
  ["Potential JCA Old GEM MINT 10 Greninja", []],
  ["CGC 9 Greninja AGS Old GEM MINT 10 candidate", [9]],
  ["CGC 9 Charizard not PSA GEM 10", [9]],
  ["Possible PSA GEM 10 Charizard", []],
  ["CGC 9 Charizard PSA GEM 10 candidate", [9]],
] as const)("counts only the actual grading claims in %s", (title, grades) => {
  render(
    <EbaySoldView
      response={{ sold: [{ ...listing(1), title }], active: [] }}
    />,
  );
  gradeOption({ name: "All grades" });
  for (const grade of grades) {
    expect(
      screen.getByRole("option", { name: `Grade ${grade} (1)` }),
    ).toBeVisible();
  }
  expect(screen.getAllByRole("option")).toHaveLength(grades.length + 1);
  expect(screen.getAllByRole("article")).toHaveLength(1);
});

test("company counts exclude explicit comparisons and include compact TAG grades", async () => {
  render(
    <EbaySoldView
      response={{
        sold: [
          { ...listing(1), title: "CGC 9 Charizard not PSA 10" },
          { ...listing(2), title: "TAGGEMMINT10 Charizard" },
          { ...listing(3), title: "PSA 10 Charizard" },
        ],
        active: [],
      }}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Filter by grading company" }),
  );
  expect(screen.getByRole("option", { name: "PSA (1)" })).toBeVisible();
  expect(screen.getByRole("option", { name: "CGC (1)" })).toBeVisible();
  fireEvent.click(screen.getByRole("option", { name: "TAG (1)" }));
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
  expect(
    screen.getByRole("heading", { name: "Taggemmint10 Charizard" }),
  ).toBeVisible();
});

test("does not combine a title's card number with a separate grader field", () => {
  render(
    <EbaySoldView
      response={{
        sold: [
          { ...listing(1), title: "Charizard 4", gradingCompany: "PSA 10" },
        ],
        active: [],
      }}
    />,
  );
  expect(gradeOption({ name: "Grade 10 (1)" })).toBeVisible();
  expect(screen.getAllByRole("option")).toHaveLength(2);
});

test.each([
  ["PSAGEMMINT10 Charizard", "PSA"],
  ["CGCGEMMINT10 Charizard", "CGC"],
  ["BGSBLACKLABEL10 Charizard", "Beckett / BGS"],
  ["SGCGEMMINT10 Charizard", "SGC"],
  ["GMA10 Charizard", "GMA"],
  ["PSAGEM10 Charizard", "PSA"],
  [
    "2025 Pokémon JTG EN N’S Zoroark ex Special Illustration Rare #185 PSA GEM 10",
    "PSA",
  ],
  ["HGA10 Charizard", "HGA"],
  [
    "MGC 10 N’s Zoroark EX 185/159 SIR Journey Together 2025 Pokemon Card Gem Mint",
    "MGC",
  ],
  [
    "Pokemon Card - Ns Zoroark ex - 185/159 - AOG 10 Gem Mint - ONLY 9 WORLDWIDE",
    "AOG",
  ],
  ["051 N's Zoroark EX 185/159 ACE Journey Together Pokemon ACE 10", "ACE"],
  ["ProfessionalSportsAuthenticator10 Charizard", "PSA"],
  ["CertifiedGuarantyCompany10 Charizard", "CGC"],
  ["SportscardGuarantyCorporation10 Charizard", "SGC"],
])("keeps company filtering consistent for %s", async (title, company) => {
  render(
    <EbaySoldView
      response={{
        sold: [
          { ...listing(1), title },
          { ...listing(2), title: "Pikachu unspecified" },
        ],
        active: [],
      }}
    />,
  );
  expect(gradeOption({ name: "Grade 10 (1)" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Filter by grade" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Filter by grading company" }),
  );
  fireEvent.click(screen.getByRole("option", { name: `${company} (1)` }));
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
  expect(screen.getByRole("heading", { level: 3 })).not.toHaveTextContent(
    "Pikachu unspecified",
  );
});

test.each([
  [
    "377608622791",
    "Pokemon SWSH Black Star Promos Greninja Gold 2021 #SWSH144 JCA 10 (88)",
    10,
    "JCA",
  ],
  [
    "377608622644",
    "Pokemon SWSH Étoile Noire Promos Greninja Or 2021 #SWSH144 JCA 10 (90)",
    10,
    "JCA",
  ],
  [
    "128115172948",
    "Pokemon SWSH Black Star Promos Greninja Gold 2021 #SWSH144 LCC 10",
    10,
    "LCC",
  ],
  [
    "267800324951",
    "Pokemon Greninja Sword & Shield Black Star Promo #SWSH144 LCC 10 Gem",
    10,
    "LCC",
  ],
  [
    "128109677996",
    "Pokemon SWSH Black Star Promos Greninja Gold 2021 #SWSH144 LCC 10",
    10,
    "LCC",
  ],
  [
    "137572444904",
    "2021 POKEMON SWSH PROMO CELEBRATIONS ETB #144 GRENINJA-GOLD STAR PCG 9 Premier C",
    9,
    "PCG",
  ],
  [
    "407288837665",
    "Pokemon Greninja Gold Star SWSH144 Sword & Shield Promo Holo Eng AGS 9.5",
    9,
    "AGS",
  ],
  [
    "336305472662",
    "CGC New MINT 8.5 Greninja Cosmos Holo SWSH144 Black Star Promo Pokémon 2021",
    8,
    "CGC",
  ],
  [
    "389551710599",
    "Pokémon TCG Greninja Star Sword & Shield Swsh144 Holo Promo AGS 10",
    10,
    "AGS",
  ],
  [
    "188750614418",
    "Pokémon TCG 2021 SWSH Promos Greninja SWSH144 Holo Black Star CGA 8.5",
    8,
    "CGA",
  ],
  [
    "407281380359",
    "2021 Pokemon Celebrations - Greninja Gold Star Promo SWSH144 - GEMIX 8",
    8,
    "GEMIX",
  ],
] as const)(
  "matches the grade and company in saved Greninja listing %s",
  async (_id, title, grade, company) => {
    render(
      <EbaySoldView
        response={{
          sold: [
            { ...listing(1), title },
            { ...listing(2), title: "Pikachu unspecified" },
          ],
          active: [],
        }}
      />,
    );
    const displayTitle = screen
      .getAllByRole("heading", { level: 3 })
      .find(
        (heading) => !heading.textContent?.includes("Pikachu Unspecified"),
      )?.textContent;
    expect(gradeOption({ name: `Grade ${grade} (1)` })).toBeVisible();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.click(gradeOption({ name: `Grade ${grade} (1)` }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
    fireEvent.click(
      screen.getByRole("button", { name: "Filter by grading company" }),
    );
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.click(screen.getByRole("option", { name: `${company} (1)` }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "false"),
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe(
      displayTitle,
    );
    expect(
      screen.getByRole("heading", { level: 3 }).querySelector("mark"),
    ).not.toBeNull();
  },
);

test.each(["grade", "condition", "gradingCompany"])(
  "uses grading information from the %s response field",
  (field) => {
    render(
      <EbaySoldView
        response={{
          sold: [
            {
              ...listing(1),
              title: "Pikachu 1st Edition #4",
              [field]: "PSA 10",
            },
          ],
          active: [],
        }}
      />,
    );
    expect(gradeOption({ name: "Grade 10 (1)" })).toBeVisible();
    expect(screen.getAllByRole("option")).toHaveLength(2);
  },
);

test("rapid grade and company changes apply the latest pair without mixing totals", async () => {
  render(
    <EbaySoldView
      response={{
        sold: ["PSA 10", "PSA 9", "CGC 10", "CGC 9"].map((title, index) => ({
          ...listing(index + 1),
          title: `Pikachu ${title}`,
        })),
        active: [],
      }}
    />,
  );
  fireEvent.click(gradeOption({ name: "Grade 10 (2)" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Filter by grading company" }),
  );
  fireEvent.click(screen.getByRole("option", { name: "CGC (2)" }));
  fireEvent.click(gradeOption({ name: "Grade 9 (2)" }));
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
  expect(screen.getByRole("heading", { name: "Pikachu Cgc 9" })).toBeVisible();
  expect(gradeOption({ name: "Grade 10 (2)" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(4));
});

test("preserves compact and half grades and numbers before separate words", () => {
  render(
    <EbaySoldView
      response={{
        sold: [
          "PSA1",
          "PSA 1 Star",
          "PSA10",
          "PSA 10 The Movie",
          "CGC10",
          "BGS9.5",
        ].map((title, index) => ({
          ...listing(index + 1),
          title: `Pikachu ${title}`,
        })),
        active: [],
      }}
    />,
  );
  expect(gradeOption({ name: "Grade 1 (2)" })).toBeVisible();
  expect(gradeOption({ name: "Grade 9 (1)" })).toBeVisible();
  expect(gradeOption({ name: "Grade 10 (3)" })).toBeVisible();
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
  fireEvent.click(gradeOption({ name: /^Grade 8 [(]/ }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 2 results"),
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
    fireEvent.click(gradeOption({ name: new RegExp(`^${grade} [(]`) }));
    await waitFor(() => {
      const resultHeadings = screen.getAllByRole("heading", { level: 3 });
      expect(resultHeadings).toHaveLength(1);
      expect(resultHeadings[0]).toHaveAccessibleName(title);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 1 result");
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
  expect(screen.getByRole("status")).toHaveTextContent("Sold · 2 results");
  fireEvent.click(gradeOption({ name: /^Grade 10 [(]/ }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(/^Sold · 1 result$/),
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
  fireEvent.click(screen.getByRole("option", { name: /^PSA \(/ }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 1 result"),
  );

  fireEvent.click(graderFilter);
  fireEvent.click(screen.getByRole("option", { name: /^Beckett \/ BGS \(/ }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 2 results"),
  );
  expect(screen.getByText("Beckett", { selector: "mark" })).toBeVisible();
  expect(screen.getByText("Bgs", { selector: "mark" })).toBeVisible();

  const includeFilter = screen.getByRole("searchbox", {
    name: "Include keywords",
  });
  fireEvent.change(includeFilter, { target: { value: "special" } });
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 1 result"),
  );
  expect(includeFilter).toHaveValue("special");
  expect(graderFilter).toHaveTextContent("Beckett / BGS");

  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(includeFilter).toHaveValue("");
  expect(graderFilter).toHaveTextContent("All companies");
  expect(screen.getByRole("status")).toHaveTextContent("Sold · 6 results");
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
  fireEvent.click(screen.getByRole("option", { name: /^TAG \(/ }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 4 results"),
  );
  expect(screen.getAllByText("Tag", { selector: "mark" })).toHaveLength(4);
  expect(
    screen.queryByRole("heading", {
      name: "Pikachu & Zekrom Gx Tag Team 33/181",
    }),
  ).not.toBeInTheDocument();

  fireEvent.click(gradeOption({ name: /^Grade 10 [(]/ }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 2 results"),
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
  fireEvent.click(gradeOption({ name: /^Grade 6 [(]/ }));
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));
  expect(screen.getByRole("heading", { name: "Pikachu Psa 6" })).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Pikachu Cgc 6.5" }),
  ).toBeVisible();
  expect(screen.getByText("Psa 6", { selector: "mark" })).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Pikachu Raw 6/102" }),
  ).not.toBeInTheDocument();
  fireEvent.click(gradeOption({ name: "All grades" }));
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
  fireEvent.click(gradeOption({ name: /^Grade 8 [(]/ }));
  const mark = await screen.findByText("Psa 8.5", { selector: "mark" });
  const title = mark.closest("h3");
  expect(title).toHaveAccessibleName("Charizard 4/102 Base Set Psa 8.5 Holo");
  expect(title?.textContent).toContain("4/102");
  expect(title?.querySelectorAll("mark")).toHaveLength(1);
});

test.each([
  ["Pikachu PSA10", 10, ["Psa10"]],
  ["Pikachu BGS 9.5", 9, ["Bgs 9.5"]],
  ["Pikachu CGC Gem Mint 10", 10, ["Cgc Gem Mint 10"]],
  ["Pikachu PSA 9.0", 9, ["Psa 9.0"]],
  ["Pikachu Grade 4", 4, ["Grade 4"]],
  ["Pikachu TAG Pristine", 10, ["Tag Pristine"]],
  ["Pikachu NM-MT 8", 8, ["Nm-Mt 8"]],
  ["PSA Charizard 10/102 Gem Mint 10", 10, ["Gem Mint 10"]],
  ["PSA 10/102 Gem Mint 10", 10, ["Gem Mint 10"]],
  ["PSA 9.5th Anniversary Mint 9", 9, ["Mint 9"]],
  ["PSA 1st Edition Gem Mint 10", 10, ["Gem Mint 10"]],
  ["PSA 1stEdition Charizard #4 Gem Mint 10", 10, ["Gem Mint 10"]],
  ["Charizard #4 PSA 10 BGS 4", 4, ["Bgs 4"]],
  ["Pikachu PSA 9-10 Mint 9", 9, ["Mint 9"]],
  ["Pikachu CGCGEMMINT10", 10, []],
  ["Pikachu 4 Graded", 4, []],
  ["Pikachu ACE 10", 10, []],
])(
  "highlights only clear grade phrases in %s",
  async (title, grade, expected) => {
    render(
      <EbaySoldView
        response={{ sold: [{ ...listing(1), title }], active: [] }}
      />,
    );
    fireEvent.click(gradeOption({ name: `Grade ${grade} (1)` }));
    // The result count can remain unchanged when selecting a grade; wait for
    // the filtering state to finish before inspecting its highlights.
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "false"),
    );
    const heading = screen.getByRole("heading", { level: 3 });
    expect(
      [...heading.querySelectorAll("mark")].map((mark) => mark.textContent),
    ).toEqual(expected);
    expect(screen.getAllByRole("article")).toHaveLength(1);
  },
);

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
  fireEvent.click(gradeOption({ name: /^Grade 10 [(]/ }));
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
    expect(screen.getByRole("status")).toHaveTextContent(/^Sold · 1 result$/),
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
    expect(screen.getByRole("status")).toHaveTextContent("Listed · 2 results"),
  );
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
  expect(screen.getByRole("status")).toHaveTextContent("Sold · 20 results");
  fireEvent.change(exclude, { target: { value: "missing" } });
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(15));
  expect(screen.getByRole("status")).toHaveTextContent("Sold · 20 results");
  fireEvent.change(exclude, { target: { value: "pikachu" } });
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Sold · 0 results"),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Clear excluded keywords" }),
  );
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(15));
  expect(screen.getByRole("status")).toHaveTextContent("Sold · 20 results");
});

test("uses found accepted prices and excludes prices of one dollar or less", () => {
  render(
    <EbaySoldView
      response={{
        sold: [
          { ...listing(1), soldPrice: "0.99" },
          { ...listing(2), soldPrice: "1" },
          {
            ...listing(3),
            soldPrice: "100",
            bestOfferAccepted: true,
            acceptedOfferPriceStatus: "found",
            acceptedOfferPrice: "25",
          },
          {
            ...listing(4),
            soldPrice: "50",
            bestOfferAccepted: true,
            acceptedOfferPriceStatus: "pending",
            acceptedOfferPrice: "0.50",
          },
          {
            ...listing(5),
            soldPrice: "100",
            bestOfferAccepted: true,
            acceptedOfferPriceStatus: "found",
            acceptedOfferPrice: "1",
          },
        ],
        active: [],
      }}
    />,
  );
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(screen.getByText("Offer accepted")).toBeVisible();
  expect(screen.queryByText("Pikachu Listing 1")).not.toBeInTheDocument();
  expect(screen.getAllByText("$25.00").length).toBeGreaterThan(0);
  expect(screen.getAllByText("$50.00").length).toBeGreaterThan(0);
  expect(screen.queryByText("$100.00")).not.toBeInTheDocument();
});

test.each([
  ["Pikachu 280 HP", false],
  ["Pikachu HP 280", false],
  ["Pikachu 280HP", false],
  ["Pikachu hp280", false],
  ["Pikachu HP", true],
  ["Pikachu 280 HP Heavily Played", true],
  ["Pikachu HP 280 Heavy Played", true],
  ["Pikachu 280 HP HP", true],
])("HP condition filter handles %s", (title, matches) => {
  render(
    <EbaySoldView
      mode="raw"
      response={{
        sold: [{ ...listing(1), title }],
        active: [],
      }}
    />,
  );
  if (matches) {
    fireEvent.click(screen.getByRole("radio", { name: "Heavily Played" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
  } else {
    expect(
      screen.queryByRole("radio", { name: "Heavily Played" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(1);
  }
});

test("raw mode shows condition filters instead of grading controls and filters locally", () => {
  render(
    <EbaySoldView
      mode="raw"
      response={{
        sold: [
          { ...listing(1), title: "Pikachu Near Mint" },
          { ...listing(2), title: "Pikachu Lightly Played" },
          { ...listing(3), title: "Pikachu unspecified" },
        ],
        active: [],
      }}
    />,
  );
  expect(
    screen.queryByRole("option", { name: /^Grade 10 [(]/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Filter by grading company" }),
  ).not.toBeInTheDocument();
  expect(screen.getAllByRole("article")).toHaveLength(3);
  fireEvent.click(screen.getByRole("radio", { name: "Lightly Played" }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(
    screen.getByRole("heading", { name: "Pikachu Lightly Played" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getAllByRole("article")).toHaveLength(3);
});
