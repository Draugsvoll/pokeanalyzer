import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useEffect, useState } from "react";
import type { EbayCredits } from "../../shared/ebayCredits";
import { EbayCreditsProvider, useEbayCredits } from "./useEbayCredits";

const mocks = vi.hoisted(() => ({
  user: { uid: "user-1", emailVerified: true } as {
    uid: string;
    emailVerified: boolean;
  } | null,
  fetch: vi.fn(),
}));

vi.mock("../context/authContextValue", () => ({
  useAuth: () => ({ user: mocks.user }),
}));
vi.mock("../utils/authenticatedFetch", () => ({
  authenticatedFetch: (...args: unknown[]) => mocks.fetch(...args),
}));

function balance(version: number, remaining = 10): EbayCredits {
  return {
    membershipCreditsRemaining: 0,
    membershipCreditsTotal: 0,
    membershipCreditsUsed: 0,
    bonusCreditsRemaining: remaining,
    bonusCreditsTotal: 10,
    bonusCreditsUsed: 10 - remaining,
    creditsRemaining: remaining,
    planId: "free",
    version,
  };
}

function response(credits: EbayCredits) {
  return { ok: true, json: async () => ({ credits }) };
}

function Consumer() {
  const { credits, loading, error, updateCredits, refreshCredits } =
    useEbayCredits();
  return (
    <>
      <output aria-label="eBay balance">
        {credits?.creditsRemaining ?? "none"}
      </output>
      <output aria-label="eBay loading">{String(loading)}</output>
      <output aria-label="eBay error">{error}</output>
      <button onClick={() => updateCredits(balance(3, 8))}>
        Complete search
      </button>
      <button onClick={() => updateCredits(balance(2, 9))}>
        Older search response
      </button>
      <button onClick={() => void refreshCredits()}>Refresh</button>
    </>
  );
}

function App() {
  return (
    <EbayCreditsProvider>
      <Consumer />
    </EbayCreditsProvider>
  );
}

beforeEach(() => {
  mocks.user = { uid: "user-1", emailVerified: true };
  mocks.fetch.mockReset();
  mocks.fetch.mockResolvedValue(response(balance(1)));
});

test("an older balance refresh cannot overwrite a completed eBay spend", async () => {
  let resolve!: (value: ReturnType<typeof response>) => void;
  mocks.fetch.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<App />);
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Complete search" }));
  expect(screen.getByLabelText("eBay balance")).toHaveTextContent("8");
  await act(async () => resolve(response(balance(1))));
  fireEvent.click(
    screen.getByRole("button", { name: "Older search response" }),
  );
  expect(screen.getByLabelText("eBay balance")).toHaveTextContent("8");
});

test("switching accounts clears the balance and ignores the previous account response", async () => {
  let resolve!: (value: ReturnType<typeof response>) => void;
  mocks.fetch.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = render(<App />);
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
  const oldSignal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
  mocks.user = { uid: "user-2", emailVerified: true };
  mocks.fetch.mockResolvedValueOnce(response(balance(1, 4)));
  view.rerender(<App />);
  await waitFor(() =>
    expect(screen.getByLabelText("eBay balance")).toHaveTextContent("4"),
  );
  expect(oldSignal.aborted).toBe(true);
  await act(async () => resolve(response(balance(100, 1))));
  expect(screen.getByLabelText("eBay balance")).toHaveTextContent("4");
  expect(mocks.fetch.mock.calls[1][2]).toBe("user-2");
  mocks.user = null;
  view.rerender(<App />);
  expect(screen.getByLabelText("eBay balance")).toHaveTextContent("none");
});

test("background credit errors preserve the known balance and can be retried", async () => {
  render(<App />);
  await waitFor(() =>
    expect(screen.getByLabelText("eBay balance")).toHaveTextContent("10"),
  );
  mocks.fetch.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() =>
    expect(screen.getByLabelText("eBay error")).toHaveTextContent(
      "couldn’t load",
    ),
  );
  expect(screen.getByLabelText("eBay balance")).toHaveTextContent("10");
  expect(screen.getByLabelText("eBay loading")).toHaveTextContent("false");
  mocks.fetch.mockResolvedValueOnce(response(balance(2, 9)));
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() =>
    expect(screen.getByLabelText("eBay balance")).toHaveTextContent("9"),
  );
  expect(screen.getByLabelText("eBay error")).toBeEmptyDOMElement();
});

test("guests and unverified accounts do not fetch eBay credits", () => {
  mocks.user = null;
  const view = render(<App />);
  mocks.user = { uid: "unverified", emailVerified: false };
  view.rerender(<App />);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

test("preserves child form state through signup, verification, and logout", async () => {
  function Form() {
    const [draft, setDraft] = useState("");
    return (
      <input
        aria-label="Signup email"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    );
  }
  function SignupApp() {
    return (
      <EbayCreditsProvider>
        <Form />
        <Consumer />
      </EbayCreditsProvider>
    );
  }
  mocks.user = null;
  const view = render(<SignupApp />);
  const input = screen.getByLabelText("Signup email");
  fireEvent.change(input, { target: { value: "new@example.com" } });

  mocks.user = { uid: "new-user", emailVerified: false };
  view.rerender(<SignupApp />);
  expect(screen.getByLabelText("Signup email")).toBe(input);
  expect(input).toHaveValue("new@example.com");
  expect(mocks.fetch).not.toHaveBeenCalled();

  mocks.user = { uid: "new-user", emailVerified: true };
  view.rerender(<SignupApp />);
  await waitFor(() =>
    expect(screen.getByLabelText("eBay balance")).toHaveTextContent("10"),
  );
  expect(screen.getByLabelText("Signup email")).toBe(input);

  mocks.user = null;
  view.rerender(<SignupApp />);
  expect(screen.getByLabelText("Signup email")).toBe(input);
  expect(input).toHaveValue("new@example.com");
  expect(screen.getByLabelText("eBay balance")).toHaveTextContent("none");
  expect(screen.getByLabelText("eBay loading")).toHaveTextContent("false");
});

test("ignores old account callbacks even after signing back into that account", async () => {
  let callbacks!: ReturnType<typeof useEbayCredits>;
  function Capture() {
    const value = useEbayCredits();
    useEffect(() => {
      callbacks = value;
    }, [value]);
    return <Consumer />;
  }
  function AccountApp() {
    return (
      <EbayCreditsProvider>
        <Capture />
      </EbayCreditsProvider>
    );
  }
  const view = render(<AccountApp />);
  await waitFor(() =>
    expect(screen.getByLabelText("eBay balance")).toHaveTextContent("10"),
  );
  const oldCallbacks = callbacks;
  act(() => callbacks.updateCredits(balance(20, 2)));

  mocks.user = { uid: "user-2", emailVerified: true };
  mocks.fetch.mockResolvedValueOnce(response(balance(1, 4)));
  view.rerender(<AccountApp />);
  await waitFor(() =>
    expect(screen.getByLabelText("eBay balance")).toHaveTextContent("4"),
  );
  await act(async () => {
    oldCallbacks.updateCredits(balance(100, 1));
    await oldCallbacks.refreshCredits();
  });
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText("eBay balance")).toHaveTextContent("4");

  mocks.user = { uid: "user-1", emailVerified: true };
  view.rerender(<AccountApp />);
  await waitFor(() =>
    expect(screen.getByLabelText("eBay balance")).toHaveTextContent("10"),
  );
  act(() => oldCallbacks.updateCredits(balance(100, 1)));
  expect(screen.getByLabelText("eBay balance")).toHaveTextContent("10");
});
