import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import type { EbayCredits } from "../../../../../shared/ebayCredits";
import { EbaySection } from "./EbaySection";
import type { EbaySearchEvent } from "../../../../../shared/ebaySearch";

const mocks = vi.hoisted(() => ({
  user: { uid: "user-1" } as { uid: string; emailVerified?: boolean } | null,
  authenticatedFetch: vi.fn(),
  refreshCredits: vi.fn(),
  updateCredits: vi.fn(),
  creditsRemaining: 10,
  unlimited: false,
  planId: "free" as EbayCredits["planId"],
}));

const credits: EbayCredits = {
  planId: "free",
  creditsRemaining: 10,
  membershipCreditsTotal: 0,
  membershipCreditsUsed: 0,
  membershipCreditsRemaining: 0,
  bonusCreditsTotal: 10,
  bonusCreditsUsed: 0,
  bonusCreditsRemaining: 10,
  version: 0,
};

vi.mock("../../../../utils/authenticatedFetch", () => ({
  authenticatedFetch: mocks.authenticatedFetch,
}));

vi.mock("../../../../context/authContextValue", () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));

vi.mock("../../../../ebay/useEbayCredits", () => ({
  useEbayCredits: () => ({
    credits: {
      ...credits,
      creditsRemaining: mocks.creditsRemaining,
      planId: mocks.planId,
      unlimited: mocks.unlimited,
    },
    loading: false,
    error: "",
    refreshCredits: mocks.refreshCredits,
    updateCredits: mocks.updateCredits,
  }),
}));

vi.mock("../../../../components/loginmodal/Loginmodal", () => ({
  default: () => null,
}));

vi.mock("../../../../services/auth", () => ({
  signInWithGoogle: vi.fn().mockResolvedValue(undefined),
}));

function successResponse(remaining = 9) {
  return new Response(
    JSON.stringify({
      credits: {
        ...credits,
        bonusCreditsUsed: 10 - remaining,
        bonusCreditsRemaining: remaining,
        creditsRemaining: remaining,
        version: 1,
      },
      data: {
        sold: [
          {
            title: "Pikachu PSA 10",
            listingType: "sold",
            soldPrice: "100",
            soldCurrency: "USD",
            url: "https://www.ebay.com/itm/1",
          },
        ],
        active: [],
      },
    }),
  );
}

function view(cardId = "card-a") {
  return (
    <MemoryRouter>
      <EbaySection
        cardId={cardId}
        cardName="Pikachu"
        cardNumber="058/102"
        setName="Base Set"
      />
    </MemoryRouter>
  );
}

function progressiveResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
    }),
    { headers: { "Content-Type": "application/x-ndjson" } },
  );
  return {
    response,
    send: (event: EbaySearchEvent) =>
      controller.enqueue(
        new TextEncoder().encode(`${JSON.stringify(event)}\n`),
      ),
    close: () => controller.close(),
    fail: (error: Error) => controller.error(error),
  };
}

test.each(["sold", "active"] as const)(
  "renders %s immediately and disables the other tab until it finishes",
  async (first) => {
    const second = first === "sold" ? "active" : "sold";
    const stream = progressiveResponse();
    mocks.authenticatedFetch.mockResolvedValueOnce(stream.response);
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "1 Market credit" }));
    await act(async () => {
      stream.send({ type: "started", credits });
      stream.send({
        type: "result",
        side: first,
        data: {
          items: [{ title: "Pikachu first result", listingType: first }],
        },
      });
    });
    expect(
      await screen.findByRole("heading", { name: "Pikachu First Result" }),
    ).toBeVisible();
    expect(screen.queryByText("Available on Ebay")).not.toBeInTheDocument();
    const firstTab = screen.getByRole("radio", {
      name: first === "sold" ? "Sold" : "Listed",
    });
    const secondTab = screen.getByRole("radio", {
      name: second === "sold" ? "Sold" : "Listed",
    });
    expect(firstTab).toBeChecked();
    expect(secondTab).toBeDisabled();
    expect(secondTab).toHaveAttribute("aria-busy", "true");
    const listingTabs = () =>
      within(screen.getByRole("radiogroup", { name: "Ebay listing type" }))
        .getAllByRole("radio")
        .map((tab) => tab.getAttribute("value"));
    expect(listingTabs()).toEqual(["sold", "active"]);
    expect(
      secondTab
        .closest("label")
        ?.querySelector(".segmented-radio-group__label--loading"),
    ).toHaveTextContent(second === "sold" ? "Sold" : "Listed");
    expect(
      secondTab.closest("label")?.querySelector(".app-loading-spinner"),
    ).not.toBeNull();
    await act(async () => {
      stream.send({ type: "result", side: second, data: { items: [] } });
      stream.send({ type: "complete", credits });
      stream.close();
    });
    expect(secondTab).toBeEnabled();
    expect(firstTab).toBeChecked();
    expect(listingTabs()).toEqual(["sold", "active"]);
    expect(
      secondTab
        .closest("label")
        ?.querySelector(".segmented-radio-group__label--loading"),
    ).toBeNull();
    expect(
      secondTab.closest("label")?.querySelector(".app-loading-spinner"),
    ).toBeNull();
    fireEvent.click(secondTab);
    expect(screen.getByText(/No matching Ebay/)).toBeVisible();
    expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(1);
  },
);

test("restores the header on a late failure while keeping the first result", async () => {
  const stream = progressiveResponse();
  mocks.authenticatedFetch.mockResolvedValueOnce(stream.response);
  render(view());
  fireEvent.click(screen.getByRole("button", { name: "1 Market credit" }));
  await act(async () => {
    stream.send({ type: "started", credits });
    stream.send({
      type: "result",
      side: "active",
      data: { items: [{ title: "Pikachu available", listingType: "active" }] },
    });
  });
  expect(
    await screen.findByRole("heading", { name: "Pikachu Available" }),
  ).toBeVisible();
  await act(async () => {
    stream.send({ type: "failure", side: "sold", message: "Unavailable" });
    stream.send({ type: "complete", credits });
    stream.close();
  });
  expect(screen.getByText("Available on Ebay").closest("header")).toContainElement(
    screen.getByRole("alert"),
  );
  expect(
    screen.getByRole("heading", { name: "Pikachu Available" }),
  ).toBeVisible();
  expect(screen.getByRole("radio", { name: "Sold" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Sold" })).not.toHaveAttribute(
    "aria-busy",
  );
  expect(screen.getByRole("button", { name: "1 Market credit" })).toBeEnabled();
});

test.each(["disconnect", "timeout"])(
  "a stream %s keeps received results and stops pending spinners",
  async (failure) => {
    const stream = progressiveResponse();
    mocks.authenticatedFetch.mockResolvedValueOnce(stream.response);
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "1 Market credit" }));
    await act(async () => {
      stream.send({ type: "started", credits });
      stream.send({
        type: "result",
        side: "sold",
        data: { items: [{ title: "Pikachu available", listingType: "sold" }] },
      });
    });
    expect(
      await screen.findByRole("heading", { name: "Pikachu Available" }),
    ).toBeVisible();
    await act(async () => {
      if (failure === "timeout")
        stream.fail(new DOMException("Body aborted", "AbortError"));
      else stream.close();
    });
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Pikachu Available" }),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: "Listed" })).not.toHaveAttribute(
      "aria-busy",
    );
    expect(mocks.refreshCredits).toHaveBeenCalledTimes(1);
  },
);

test("keeps retry disabled after an early failure until the other side finishes", async () => {
  const stream = progressiveResponse();
  mocks.authenticatedFetch.mockResolvedValueOnce(stream.response);
  render(view());
  fireEvent.click(screen.getByRole("button", { name: "1 Market credit" }));
  await act(async () => {
    stream.send({ type: "started", credits });
    stream.send({ type: "failure", side: "sold", message: "Unavailable" });
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "couldn't load Ebay sales.",
  );
  expect(screen.getByRole("button", { name: "1 Market credit" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "1 Market credit" }));
  expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(1);
  await act(async () => {
    stream.send({ type: "result", side: "active", data: { items: [] } });
    stream.send({ type: "complete", credits });
    stream.close();
  });
  expect(screen.getByRole("radio", { name: "Listed" })).toBeChecked();
  expect(screen.getByRole("button", { name: "1 Market credit" })).toBeEnabled();
  expect(screen.getByText("No matching Ebay listings found.")).toBeVisible();
});

test("keeps only the header when both streamed sides fail and refreshes the refunded balance", async () => {
  const stream = progressiveResponse();
  mocks.authenticatedFetch.mockResolvedValueOnce(stream.response);
  render(view());
  fireEvent.click(screen.getByRole("button", { name: "1 Market credit" }));
  await act(async () => {
    stream.send({ type: "started", credits });
    stream.send({ type: "failure", side: "sold", message: "Unavailable" });
    stream.send({ type: "failure", side: "active", message: "Unavailable" });
    stream.send({ type: "error", message: "Search failed" });
    stream.close();
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "couldn't load Ebay sales and listings.",
  );
  expect(screen.getByText("Available on Ebay").closest("header")).toContainElement(
    screen.getByRole("alert"),
  );
  expect(
    screen.queryByRole("radiogroup", { name: "Sort Ebay listings" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "1 Market credit" })).toBeEnabled();
  expect(mocks.refreshCredits).toHaveBeenCalledTimes(1);
});

test.each(["card", "logout", "account"])(
  "ignores subsequent stream events after a %s change",
  async (change) => {
    const stream = progressiveResponse();
    mocks.authenticatedFetch.mockResolvedValueOnce(stream.response);
    const { rerender } = render(view());
    fireEvent.click(screen.getByRole("button", { name: "1 Market credit" }));
    await act(async () => {
      stream.send({ type: "started", credits });
      stream.send({
        type: "result",
        side: "sold",
        data: { items: [{ title: "Pikachu old result", listingType: "sold" }] },
      });
    });
    expect(
      await screen.findByRole("heading", { name: "Pikachu Old Result" }),
    ).toBeVisible();
    const signal = mocks.authenticatedFetch.mock.calls[0][1]
      .signal as AbortSignal;
    mocks.updateCredits.mockClear();
    if (change === "logout") mocks.user = null;
    if (change === "account") mocks.user = { uid: "user-2" };
    rerender(view(change === "card" ? "card-b" : "card-a"));
    expect(signal.aborted).toBe(true);
    await act(async () => {
      stream.send({
        type: "result",
        side: "active",
        data: {
          items: [{ title: "Pikachu late result", listingType: "active" }],
        },
      });
      stream.send({ type: "complete", credits });
      stream.close();
    });
    expect(mocks.updateCredits).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("radiogroup", { name: "Sort Ebay listings" }),
    ).not.toBeInTheDocument();
    expect(mocks.refreshCredits).not.toHaveBeenCalled();
  },
);

beforeEach(() => {
  mocks.user = { uid: "user-1" };
  mocks.creditsRemaining = 10;
  mocks.planId = "free";
  mocks.unlimited = false;
  mocks.authenticatedFetch
    .mockReset()
    .mockImplementation(async () => successResponse());
  mocks.refreshCredits = vi.fn().mockResolvedValue(undefined);
  mocks.updateCredits = vi.fn();
});

test("replaces the intro with results after an explicit search and does not refetch on rerenders", async () => {
  const { rerender } = render(view());
  const heading = screen.getByText("Available on Ebay");
  expect(heading).toBeVisible();
  expect(screen.queryByText("10 Market credits")).not.toBeInTheDocument();
  expect(mocks.authenticatedFetch).not.toHaveBeenCalled();
  const action = screen.getByRole("button", { name: "1 Market credit" });
  expect(action).toHaveTextContent(/^1 Market credit$/);
  expect(action).toHaveClass(
    "app-btn-pill--solid",
    "app-btn--fit-content",
    "app-btn--large",
  );
  for (const control of [
    screen.queryByRole("radio", { name: "Sold" }),
    screen.queryByRole("radio", { name: "Grade 10" }),
    screen.queryByRole("searchbox", { name: "Include keywords" }),
    screen.queryByRole("radiogroup", { name: "Sort Ebay listings" }),
  ]) {
    expect(control).not.toBeInTheDocument();
  }
  expect(screen.getByText("Pikachu").compareDocumentPosition(action)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  expect(screen.queryByText(/No matching Ebay/)).not.toBeInTheDocument();
  fireEvent.click(action);
  expect(
    await screen.findByRole("heading", { name: "Pikachu Psa 10" }),
  ).toBeVisible();
  expect(mocks.updateCredits).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("radiogroup", { name: "Sort Ebay listings" }),
  ).toBeVisible();
  expect(
    screen.queryByText("Ebay completed sales & active listings"),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("10 Market credits")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", {
      name: /1 Market credit|Hide results|Show results/,
    }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("radiogroup", { name: "Ebay listing type" }),
  ).toBeVisible();

  mocks.updateCredits = vi.fn();
  mocks.refreshCredits = vi.fn();
  rerender(view());
  expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(1);
  expect(mocks.updateCredits).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Pikachu Psa 10" })).toBeVisible();
  expect(
    screen.getByRole("radiogroup", { name: "Sort Ebay listings" }),
  ).toBeVisible();
});

test("keeps the intro while loading, prevents duplicate requests, and leaves result controls usable", async () => {
  let resolve!: (response: Response) => void;
  mocks.authenticatedFetch.mockReturnValue(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  render(view());
  const action = screen.getByRole("button", { name: "1 Market credit" });
  fireEvent.click(action);
  fireEvent.click(action);
  expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Available on Ebay")).toBeVisible();
  expect(screen.queryByText("10 Market credits")).not.toBeInTheDocument();
  const pendingAction = screen.getByRole("button", {
    name: "Searching Ebay...",
  });
  expect(pendingAction).toBeDisabled();
  expect(pendingAction).toHaveAttribute("aria-busy", "true");
  expect(pendingAction).not.toHaveTextContent("1 Market credit");
  const loadingMessage = screen.getByRole("status");
  expect(loadingMessage).toBeVisible();
  expect(pendingAction.closest(".card-feature-header")).toContainElement(
    loadingMessage,
  );
  expect(loadingMessage.querySelector("svg, .app-loading-spinner")).toBeNull();
  expect(pendingAction.querySelector(".app-btn__spinner")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  expect(
    screen.queryByRole("radio", { name: "Listed" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("radio", { name: "Grade 10" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("searchbox", { name: "Include keywords" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("radiogroup", { name: "Sort Ebay listings" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/No matching Ebay/)).not.toBeInTheDocument();
  await act(async () => {
    resolve(successResponse());
  });
  expect(
    screen.getByRole("radiogroup", { name: "Sort Ebay listings" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("radio", { name: "Listed" }));
  expect(screen.getByText("No matching Ebay listings found.")).toBeVisible();
  fireEvent.click(screen.getByRole("radio", { name: "Sold" }));
  expect(screen.getByRole("heading", { name: "Pikachu Psa 10" })).toBeVisible();
  expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(1);
});

test("shows no-matches only after an empty successful search and removes the CTA", async () => {
  mocks.authenticatedFetch.mockResolvedValue(
    new Response(JSON.stringify({ credits, data: { sold: [], active: [] } })),
  );
  render(view());
  expect(screen.queryByText(/No matching Ebay/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "1 Market credit" }));
  expect(
    await screen.findByText("No matching Ebay sales found."),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "1 Market credit" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("radiogroup", { name: "Sort Ebay listings" }),
  ).toBeVisible();
  expect(screen.getByRole("radio", { name: "Listed" })).toBeEnabled();
  expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(1);
});

test("keeps results visible without credit prompts after spending the final credit", async () => {
  mocks.creditsRemaining = 1;
  mocks.updateCredits.mockImplementation((next: EbayCredits) => {
    mocks.creditsRemaining = next.creditsRemaining;
  });
  mocks.authenticatedFetch.mockResolvedValue(successResponse(0));
  const { rerender } = render(view());
  fireEvent.click(screen.getByRole("button", { name: "1 Market credit" }));
  expect(
    await screen.findByRole("heading", { name: "Pikachu Psa 10" }),
  ).toBeVisible();
  expect(mocks.creditsRemaining).toBe(0);
  rerender(view());

  expect(
    screen.getByRole("radiogroup", { name: "Sort Ebay listings" }),
  ).toBeVisible();
  expect(screen.queryByText("0 Market credits")).not.toBeInTheDocument();
  expect(screen.queryByText(/No Market credits left/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", {
      name: /1 Market credit|Add credits|Refresh Market credits/,
    }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Listed" })).toBeEnabled();
  expect(screen.getByRole("heading", { name: "Pikachu Psa 10" })).toBeVisible();
});

test.each(["sold", "active"] as const)(
  "keeps successful results when %s fails and starts a fresh search on retry",
  async (failedSide) => {
    const availableSide = failedSide === "sold" ? "active" : "sold";
    mocks.authenticatedFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          credits,
          data: {
            [failedSide]: null,
            [availableSide]: {
              items: [
                {
                  title: "Pikachu partial result",
                  listingType: availableSide,
                },
              ],
            },
          },
        }),
      ),
    );
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "1 Market credit" }));
    await screen.findByRole("radiogroup", { name: "Sort Ebay listings" });
    expect(screen.getByText("Available on Ebay")).toBeVisible();
    const header = screen.getByText("Available on Ebay").closest("header");
    expect(header).toContainElement(screen.getByRole("alert"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      `We couldn't load Ebay ${failedSide === "sold" ? "sales" : "listings"}. Please try again.`,
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "1 Market credit" })).toBeEnabled();
    fireEvent.click(
      screen.getByRole("radio", {
        name: availableSide === "sold" ? "Sold" : "Listed",
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Pikachu Partial Result" }),
    ).toBeVisible();

    mocks.authenticatedFetch.mockResolvedValueOnce(
      new Response("{}", { status: 502 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "1 Market credit" }));
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("heading", { name: "Pikachu Partial Result" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 Market credit" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "1 Market credit" }));
    await waitFor(() =>
      expect(screen.queryByText("Available on Ebay")).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "1 Market credit" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Sold" }));
    expect(
      screen.getByRole("heading", { name: "Pikachu Psa 10" }),
    ).toBeVisible();
    expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(3);
  },
);

test("keeps a single error inside the header when both Ebay responses are missing", async () => {
  mocks.authenticatedFetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ credits, data: { sold: null, active: null } }),
    ),
  );
  render(view());
  fireEvent.click(screen.getByRole("button", { name: "1 Market credit" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(
    "We couldn't load Ebay sales and listings. Please try again.",
  );
  expect(screen.getByText("Available on Ebay").closest("header")).toContainElement(
    alert,
  );
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.queryByText(/No matching Ebay/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "1 Market credit" })).toBeEnabled();
});

test.each(["card", "logout", "account"])(
  "cancels and ignores stale results and credits on %s changes",
  async (change) => {
    let resolve!: (response: Response) => void;
    mocks.authenticatedFetch.mockReturnValue(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    const { rerender } = render(view());
    fireEvent.click(screen.getByRole("button", { name: "1 Market credit" }));
    const signal = mocks.authenticatedFetch.mock.calls[0][1]
      .signal as AbortSignal;
    expect(mocks.authenticatedFetch.mock.calls[0][2]).toBe("user-1");

    if (change === "logout") mocks.user = null;
    if (change === "account") mocks.user = { uid: "user-2" };
    rerender(view(change === "card" ? "card-b" : "card-a"));
    expect(signal.aborted).toBe(true);
    await act(async () => {
      resolve(successResponse());
    });
    expect(mocks.updateCredits).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Pikachu Psa 10" }),
    ).not.toBeInTheDocument();
    expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(1);
  },
);

test.each([409, 502])(
  "handles HTTP %s within Ebay and keeps the intro available for retry",
  async (status) => {
    mocks.authenticatedFetch.mockResolvedValue(new Response("{}", { status }));
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "1 Market credit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      status === 409
        ? "You don't have enough Market credits for this search."
        : "We couldn't load Ebay sales and listings. Please try again.",
    );
    expect(
      screen.getByText("Available on Ebay").closest("header"),
    ).toContainElement(screen.getByRole("alert"));
    expect(mocks.refreshCredits).toHaveBeenCalledTimes(1);
    expect(mocks.updateCredits).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("radiogroup", { name: "Ebay listing type" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("searchbox", { name: "Include keywords" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Available on Ebay")).toBeVisible();
    expect(screen.getByRole("button", { name: "1 Market credit" })).toBeEnabled();

    mocks.authenticatedFetch.mockResolvedValue(successResponse());
    fireEvent.click(screen.getByRole("button", { name: "1 Market credit" }));
    expect(
      await screen.findByRole("heading", { name: "Pikachu Psa 10" }),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: "Sort Ebay listings" }),
    ).toBeVisible();
    await waitFor(() => expect(mocks.updateCredits).toHaveBeenCalledTimes(1));
    expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(2);
  },
);

test.each(["free", "basic", "pro"] as const)(
  "offers Add credits without a no-credit banner or retry controls for %s",
  (planId) => {
    mocks.planId = planId;
    mocks.creditsRemaining = 0;
    render(view());
    expect(screen.queryByText("0 Market credits")).not.toBeInTheDocument();
    expect(screen.queryByText(/No Market credits left/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add credits" })).toBeEnabled();
    expect(
      screen.queryByRole("button", {
        name: /Refresh Market credits|Retry Market credits/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /1 Market credit|top.?up/i,
      }),
    ).not.toBeInTheDocument();
    expect(mocks.authenticatedFetch).not.toHaveBeenCalled();
  },
);

test("guests see the original authentication options even with a stale zero balance", () => {
  mocks.user = null;
  mocks.creditsRemaining = 0;
  render(view());

  expect(screen.getByRole("button", { name: "Sign up" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Log in" })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Add credits" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/No Market credits left/)).not.toBeInTheDocument();
  expect(mocks.authenticatedFetch).not.toHaveBeenCalled();
});

test("explains email verification without fetching", () => {
  mocks.user = { uid: "user-1", emailVerified: false };
  render(view());
  expect(
    screen.getByText("Please verify your email before searching Ebay."),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "1 Market credit" })).toBeDisabled();
  expect(mocks.authenticatedFetch).not.toHaveBeenCalled();
});

test("shows independent demo results without fetching or spending credits", () => {
  render(
    <MemoryRouter>
      <EbaySection
        cardId="demo"
        cardName="Pikachu"
        isDemo
        demoResponse={{ sold: [], active: [] }}
      />
    </MemoryRouter>,
  );
  expect(screen.queryByText("Demo results")).not.toBeInTheDocument();
  expect(
    screen.getByRole("radiogroup", { name: "Sort Ebay listings" }),
  ).toBeVisible();
  expect(
    screen.queryByText("Ebay completed sales & active listings"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", {
      name: /1 Market credit|Hide results|Show results/,
    }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("No matching Ebay sales found.")).toBeVisible();
  expect(mocks.authenticatedFetch).not.toHaveBeenCalled();
  expect(mocks.updateCredits).not.toHaveBeenCalled();
});

test("unlimited Pro can search with zero credits", async () => {
  mocks.planId = "pro";
  mocks.unlimited = true;
  mocks.creditsRemaining = 0;
  render(view());
  const search = screen.getByRole("button", { name: "Search Ebay" });
  expect(search).toBeEnabled();
  fireEvent.click(search);
  expect(
    await screen.findByRole("heading", { name: "Pikachu Psa 10" }),
  ).toBeVisible();
  expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(1);
});
