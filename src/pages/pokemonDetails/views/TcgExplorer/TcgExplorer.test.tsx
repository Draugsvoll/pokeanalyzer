import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TcgExplorerSection } from "./TcgExplorerSection";
import { TcgExplorerView } from "./TcgExplorerView";
import { getTcgPriceSummary } from "./tcgPrices";
import type { TcgSnapshot } from "../../../../../shared/tcgExplorer";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  update: vi.fn(),
  refresh: vi.fn(),
  remaining: 5,
  unlimited: false,
  user: { uid: "user", emailVerified: true } as {
    uid: string;
    emailVerified: boolean;
  } | null,
}));
vi.mock("../../../../utils/authenticatedFetch", () => ({
  authenticatedFetch: mocks.fetch,
}));
vi.mock("../../../../context/authContextValue", () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));
vi.mock("../../../../ebay/useEbayCredits", () => ({
  useEbayCredits: () => ({
    credits: { creditsRemaining: mocks.remaining, unlimited: mocks.unlimited },
    updateCredits: mocks.update,
    refreshCredits: mocks.refresh,
    error: "",
  }),
}));
vi.mock("../../../../components/loginmodal/Loginmodal", () => ({
  default: () => null,
}));
vi.mock("../../../../services/auth", () => ({ signInWithGoogle: vi.fn() }));
const sale = {
  price: 10,
  shippingPrice: 2,
  condition: "Near Mint",
  variant: "Holofoil",
  language: "English",
  quantity: 1,
  soldDate: "2026-10-01T12:00:00Z",
};
const snapshot: TcgSnapshot = {
  productId: 123,
  printing: "Holofoil",
  condition: "nearMint",
  language: "English",
  fetchedAt: "2026-10-28T12:00:00Z",
  sales: [sale],
  offers: [],
  offersMatched: true,
};
const balance = {
  planId: "basic",
  membershipCreditsRemaining: 4,
  membershipCreditsTotal: 5,
  membershipCreditsUsed: 1,
  bonusCreditsRemaining: 0,
  bonusCreditsTotal: 0,
  bonusCreditsUsed: 0,
  creditsRemaining: 4,
  version: 1,
};
function success(data = snapshot) {
  return Response.json({ data, credits: balance });
}
function view(cardId = "card-a") {
  return (
    <MemoryRouter>
      <TcgExplorerSection
        cardId={cardId}
        cardName="Charizard"
        printing="Holofoil"
      />
    </MemoryRouter>
  );
}
afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.clearAllMocks();
  mocks.user = { uid: "user", emailVerified: true };
  mocks.remaining = 5;
  mocks.unlimited = false;
  mocks.fetch.mockResolvedValue(success());
});

test("opening does not spend credits; search submits English and all conditions once", async () => {
  render(view());
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByRole("radio", { name: "NM" })).not.toBeInTheDocument();
  expect(mocks.fetch).not.toHaveBeenCalled();
  const button = screen.getByRole("button", {
    name: "1 Market credit",
  });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(balance));
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({
    cardId: "card-a",
    condition: "all",
    language: "English",
  });
});
test("single and dual modes are local controls and prices exclude shipping", () => {
  render(<TcgExplorerView data={snapshot} />);
  expect(
    screen.queryByRole("region", { name: "TCGplayer available offers" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "Dual" }));
  expect(
    screen.getByRole("region", { name: "TCGplayer available offers" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("checkbox", { name: "Include shipping" }),
  ).not.toBeInTheDocument();
  expect(screen.getAllByText("$10.00").length).toBeGreaterThan(0);
  expect(mocks.fetch).not.toHaveBeenCalled();
});
test("failed and unmatched offer panels do not claim there are no market listings", () => {
  const { rerender } = render(
    <TcgExplorerView data={{ ...snapshot, offers: null }} />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Listed" }));
  expect(screen.getByText(/couldn't load offers/)).toBeInTheDocument();
  rerender(<TcgExplorerView data={{ ...snapshot, offersMatched: false }} />);
  expect(screen.getByText(/No exact product match/)).toBeInTheDocument();
});
test("a failed search shows the generic message", async () => {
  mocks.fetch.mockResolvedValueOnce(
    new Response("Too many requests", {
      status: 429,
      headers: { "Content-Type": "text/plain" },
    }),
  );
  render(view());
  fireEvent.click(screen.getByRole("button", { name: "1 Market credit" }));
  expect(
    await screen.findByText(
      "We couldn't load TCGplayer results. Please try again.",
    ),
  ).toBeVisible();
  expect(screen.queryByText(/Too many requests/)).not.toBeInTheDocument();
});

test("unlimited users can search without a numeric balance", async () => {
  mocks.remaining = 0;
  mocks.unlimited = true;
  render(view());
  fireEvent.click(screen.getByRole("button", { name: "Search TCGplayer" }));
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
});
test("unverified accounts cannot start a search", () => {
  mocks.user = { uid: "user", emailVerified: false };
  render(view());
  expect(screen.getByRole("button", { name: "1 Market credit" })).toBeDisabled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});
test("changing cards cancels old work and prevents stale results", async () => {
  let finish!: (response: Response) => void;
  mocks.fetch.mockReturnValue(
    new Promise<Response>((resolve) => {
      finish = resolve;
    }),
  );
  const { rerender } = render(view());
  fireEvent.click(screen.getByRole("button", { name: "1 Market credit" }));
  const signal: AbortSignal = mocks.fetch.mock.calls[0][1].signal;
  rerender(view("card-b"));
  expect(signal.aborted).toBe(true);
  await act(async () => finish(success()));
  expect(
    screen.queryByRole("region", { name: "TCGplayer recent sales" }),
  ).not.toBeInTheDocument();
  expect(mocks.update).not.toHaveBeenCalled();
});
test("sorting sales by date keeps null dates last", () => {
  render(
    <TcgExplorerView
      data={{
        ...snapshot,
        sales: [
          sale,
          { ...sale, price: 25, soldDate: null },
          { ...sale, price: 20, soldDate: "2026-10-02T12:00:00Z" },
        ],
      }}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Newest" }));
  const rows = screen.getAllByRole("article");
  expect(rows[0]).toHaveTextContent("$20.00");
  expect(rows[2]).toHaveTextContent("Date unavailable");
});
test("summaries use returned rows and shipping without multiplying quantities", () => {
  expect(getTcgPriceSummary([], false)).toBeNull();
  expect(
    getTcgPriceSummary([sale, { ...sale, price: 20, quantity: 4 }], true),
  ).toEqual({ high: 22, median: 17, low: 12 });
});

test("shared controls disable date sorting for offers and expand both panels locally", () => {
  render(<TcgExplorerView data={snapshot} />);
  fireEvent.click(screen.getByRole("radio", { name: "Listed" }));
  expect(screen.getByRole("radio", { name: "Newest" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Oldest" })).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "Dual" }));
  expect(screen.getByRole("radio", { name: "Newest" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Expand all listings" }));
  for (const row of screen.getAllByRole("article")) {
    expect(row).toHaveClass("marketplace-listings__result--expanded");
  }
  fireEvent.click(
    screen.getByRole("button", { name: "Collapse all listings" }),
  );
  for (const row of screen.getAllByRole("article")) {
    expect(row).not.toHaveClass("marketplace-listings__result--expanded");
  }
  expect(
    screen.queryByRole("searchbox", { name: "Include keywords" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("group", { name: "Grade" }),
  ).not.toBeInTheDocument();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

test("Compsniper seller metadata and sample limits are rendered", () => {
  render(
    <TcgExplorerView
      data={{
        ...snapshot,
        offers: [
          {
            ...sale,
            printing: "Holofoil",
            sellerName: "Shop",
            sellerRating: 99,
            verifiedSeller: true,
            directSeller: false,
            goldSeller: true,
            sellerSales: 1234,
            sellerLocation: "California",
          },
        ],
      }}
    />,
  );
  expect(screen.queryByText(/Up to 250 recent sales/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "Listed" }));
  expect(
    screen.queryByText(/First page of up to 50 listings/),
  ).not.toBeInTheDocument();
  expect(screen.getByText("Gold seller")).toBeInTheDocument();
  expect(screen.getByText("California")).toBeInTheDocument();
  expect(screen.getByText(/1.234 seller sales/)).toBeInTheDocument();
});

test("condition buttons filter all variants locally and update the summary", () => {
  render(
    <TcgExplorerView
      data={{
        ...snapshot,
        printing: "all",
        sales: [
          sale,
          {
            ...sale,
            condition: "Lightly Played",
            variant: "Reverse Holofoil",
            price: 25,
          },
        ],
      }}
    />,
  );
  expect(
    screen.getByRole("link", { name: "View listings on TCG" }),
  ).toHaveAttribute(
    "href",
    `https://www.tcgplayer.com/product/${snapshot.productId}`,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Lightly Played" }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("article")).toHaveTextContent("$25.00");
  fireEvent.click(screen.getByRole("radio", { name: "Damaged" }));
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "All conditions" }));
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

test("first streamed side appears immediately, hides header, and keeps the other side loading", async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  mocks.fetch.mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          stream = controller;
        },
      }),
      { headers: { "Content-Type": "application/x-ndjson" } },
    ),
  );
  const send = async (event: unknown) =>
    act(async () => {
      stream.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
    });
  render(view());
  fireEvent.click(screen.getByRole("button", { name: /1 Market credit/ }));
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
  expect(mocks.fetch.mock.calls[0][0]).toContain("stream=1");
  await send({ type: "started", credits: balance });
  await send({
    type: "result",
    side: "active",
    data: { ...snapshot, sales: null },
  });
  expect(
    screen.getByRole("region", { name: "TCGplayer available offers" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /1 Market credit/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Sold" })).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "Dual" }));
  expect(
    screen.getByRole("status", { name: "Loading sold TCG results" }),
  ).toBeInTheDocument();
  await send({
    type: "result",
    side: "sold",
    data: { ...snapshot, offers: null, offersMatched: false },
  });
  await send({ type: "complete", credits: balance });
  expect(
    screen.queryByRole("status", { name: "Loading sold TCG results" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("article")).toHaveTextContent("$10.00");
  expect(screen.queryByRole("radio", { name: "Sold" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "Single" }));
  expect(screen.getByRole("radio", { name: "Sold" })).toBeEnabled();
});

test("a failed second side preserves results and restores the retry header", async () => {
  const events = [
    { type: "started", credits: balance },
    {
      type: "result",
      side: "sold",
      data: { ...snapshot, offers: null, offersMatched: false },
    },
    { type: "failure", side: "active", message: "Unavailable" },
    { type: "complete", credits: balance },
  ];
  mocks.fetch.mockResolvedValue(
    new Response(events.map((event) => JSON.stringify(event)).join("\n"), {
      headers: { "Content-Type": "application/x-ndjson" },
    }),
  );
  render(view());
  fireEvent.click(screen.getByRole("button", { name: /1 Market credit/ }));
  await screen.findByRole("article");
  expect(screen.getByRole("button", { name: /1 Market credit/ })).toBeInTheDocument();
  expect(screen.getByText(/couldn't load TCG listings/)).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Listed" })).toBeDisabled();
});

test("demo renders saved TCG data without a search, credits, or an unavailable header", () => {
  mocks.user = null;
  mocks.remaining = 0;
  render(
    <MemoryRouter>
      <TcgExplorerSection
        cardId="demo"
        cardName="Charizard"
        isDemo
        demoResponse={snapshot}
      />
    </MemoryRouter>,
  );
  expect(screen.getByRole("article")).toHaveTextContent("$10.00");
  expect(screen.queryByText(/demo has no saved/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "1 Market credit" }),
  ).not.toBeInTheDocument();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

test("demo without saved TCG data stays unavailable and never searches", () => {
  render(
    <MemoryRouter>
      <TcgExplorerSection cardId="demo" cardName="Charizard" isDemo />
    </MemoryRouter>,
  );
  expect(
    screen.getByText(/demo has no saved TCGplayer results/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "1 Market credit" }),
  ).not.toBeInTheDocument();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

test("falls back to single mode on narrow screens and restores dual on widening", () => {
  let change = () => {};
  const media = {
    matches: true,
    addEventListener: (_event: string, callback: () => void) => {
      change = callback;
    },
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media),
  );
  render(<TcgExplorerView data={snapshot} />);
  fireEvent.click(screen.getByRole("radio", { name: "Dual" }));
  expect(screen.queryByRole("radio", { name: "Sold" })).not.toBeInTheDocument();
  act(() => {
    media.matches = false;
    change();
  });
  expect(screen.queryByRole("radio", { name: "Dual" })).not.toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Sold" })).toBeChecked();
  act(() => {
    media.matches = true;
    change();
  });
  expect(screen.getByRole("radio", { name: "Dual" })).toBeChecked();
});

test("keeps item expansion attached to the original row after sorting and filtering", () => {
  const clientWidth = vi
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockReturnValue(100);
  const scrollWidth = vi
    .spyOn(HTMLElement.prototype, "scrollWidth", "get")
    .mockReturnValue(300);
  try {
    const { container } = render(
      <TcgExplorerView
        data={{
          ...snapshot,
          sales: [
            {
              ...sale,
              price: 30,
              condition: "Lightly Played",
              soldDate: "2026-10-01T12:00:00Z",
            },
            { ...sale, price: 20, soldDate: "2026-10-02T12:00:00Z" },
            { ...sale, price: 10, soldDate: "2026-10-03T12:00:00Z" },
          ],
        }}
      />,
    );
    const rows = () => Array.from(container.querySelectorAll("article"));
    const expandedRow = rows()[1];
    const results = container.querySelector<HTMLDivElement>(".marketplace-listings__results")!;
    results.scrollTop = 300;
    fireEvent.click(
      within(expandedRow).getByRole("button", { name: "Expand listing title" }),
    );
    fireEvent.click(
      within(
        screen.getByRole("radiogroup", { name: "Sort TCG listings" }),
      ).getAllByRole("radio")[1],
    );
    expect(results.scrollTop).toBe(0);
    expect(rows()[1]).toBe(expandedRow);
    expect(expandedRow).toHaveClass("marketplace-listings__result--expanded");
    results.scrollTop = 200;
    fireEvent.click(screen.getByRole("radio", { name: "Near Mint" }));
    expect(results.scrollTop).toBe(0);
    fireEvent.click(
      within(
        screen.getByRole("radiogroup", { name: "Sort TCG listings" }),
      ).getAllByRole("radio")[0],
    );
    expect(rows()[0]).toBe(expandedRow);
    expect(expandedRow).toHaveClass("marketplace-listings__result--expanded");
    expect(rows()[1]).not.toHaveClass("marketplace-listings__result--expanded");
  } finally {
    clientWidth.mockRestore();
    scrollWidth.mockRestore();
  }
});
