import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserSubscription } from "./types";
import {
  MembershipSubscriptionProvider,
  useMembershipSubscription,
} from "./useMembershipSubscription";

const mocks = vi.hoisted(() => ({
  cancelSubscriptionAtPeriodEnd: vi.fn(),
  createBillingPortal: vi.fn(),
  createMembershipCheckout: vi.fn(),
  fetchSubscription: vi.fn(),
  user: { uid: "user-1" },
}));

vi.mock("../context/authContextValue", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("./subscriptionApi", () => ({
  cancelSubscriptionAtPeriodEnd: mocks.cancelSubscriptionAtPeriodEnd,
  createBillingPortal: mocks.createBillingPortal,
  createMembershipCheckout: mocks.createMembershipCheckout,
  fetchSubscription: mocks.fetchSubscription,
  SUBSCRIPTION_REFRESH_EVENT: "subscription-refresh",
}));

vi.mock("../utils/logClientError", () => ({
  logClientError: vi.fn(),
}));

const initialSubscription = {
  bonusCreditsRemaining: 0,
  bonusCreditsTotal: 0,
  membershipCreditsRemaining: 5,
  membershipCreditsTotal: 10,
  membershipCreditsUsed: 5,
  planId: "collector",
  planName: "Collector",
  status: "active",
} as UserSubscription;

function SubscriptionConsumer({ name }: { name: string }) {
  const {
    cancelAtPeriodEnd,
    openBillingPortal,
    startMembershipCheckout,
    subscription,
    subscriptionMessage,
    updateSubscription,
  } = useMembershipSubscription();

  return (
    <div>
      <output aria-label={`${name} credits`}>
        {subscription?.membershipCreditsRemaining ?? "loading"}
      </output>
      {subscriptionMessage && (
        <output aria-label={`${name} subscription message`}>
          {subscriptionMessage}
        </output>
      )}
      {name === "feature" && (
        <>
          <button
            type="button"
            onClick={() =>
              updateSubscription((current) => ({
                ...(current ?? initialSubscription),
                membershipCreditsRemaining: 4,
                membershipCreditsUsed: 6,
              }))
            }
          >
            Spend credit
          </button>
          <button
            type="button"
            onClick={() => void startMembershipCheckout("pro")}
          >
            Start checkout
          </button>
          <button type="button" onClick={() => void openBillingPortal()}>
            Open billing portal
          </button>
          <button type="button" onClick={() => void cancelAtPeriodEnd()}>
            Cancel subscription
          </button>
        </>
      )}
    </div>
  );
}

function TestProvider({ children }: { children: ReactNode }) {
  return (
    <MembershipSubscriptionProvider>{children}</MembershipSubscriptionProvider>
  );
}

describe("MembershipSubscriptionProvider", () => {
  beforeEach(() => {
    mocks.cancelSubscriptionAtPeriodEnd.mockReset();
    mocks.createBillingPortal.mockReset();
    mocks.createMembershipCheckout.mockReset();
    mocks.fetchSubscription.mockReset();
    mocks.fetchSubscription.mockResolvedValue({
      subscription: initialSubscription,
    });
  });

  it("fetches once and shares subscription updates between consumers", async () => {
    render(
      <StrictMode>
        <TestProvider>
          <SubscriptionConsumer name="header" />
          <SubscriptionConsumer name="feature" />
        </TestProvider>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("header credits")).toHaveTextContent("5");
      expect(screen.getByLabelText("feature credits")).toHaveTextContent("5");
    });
    expect(mocks.fetchSubscription).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Spend credit" }));

    expect(screen.getByLabelText("header credits")).toHaveTextContent("4");
    expect(screen.getByLabelText("feature credits")).toHaveTextContent("4");
  });

  it("does not let an older refresh overwrite an authoritative update", async () => {
    let resolveRefresh:
      ((value: { subscription: UserSubscription }) => void) | undefined;
    mocks.fetchSubscription.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    render(
      <StrictMode>
        <TestProvider>
          <SubscriptionConsumer name="header" />
          <SubscriptionConsumer name="feature" />
        </TestProvider>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(mocks.fetchSubscription).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Spend credit" }));
    expect(screen.getByLabelText("header credits")).toHaveTextContent("4");

    await act(async () => {
      resolveRefresh?.({ subscription: initialSubscription });
    });

    expect(screen.getByLabelText("header credits")).toHaveTextContent("4");
    expect(screen.getByLabelText("feature credits")).toHaveTextContent("4");
  });

  it("hides technical checkout errors behind a user-facing message", async () => {
    mocks.createMembershipCheckout.mockRejectedValue(
      new Error("Stripe checkout session creation failed"),
    );

    render(
      <TestProvider>
        <SubscriptionConsumer name="feature" />
      </TestProvider>,
    );

    await screen.findByText("5");
    fireEvent.click(screen.getByRole("button", { name: "Start checkout" }));

    expect(
      await screen.findByText("We couldn’t open checkout. Please try again."),
    ).toBeVisible();
    expect(
      screen.queryByText("Stripe checkout session creation failed"),
    ).toBeNull();
  });

  it("hides technical billing-portal errors behind a user-facing message", async () => {
    mocks.createBillingPortal.mockRejectedValue(
      new Error("Customer has no Stripe identifier"),
    );

    render(
      <TestProvider>
        <SubscriptionConsumer name="feature" />
      </TestProvider>,
    );

    await screen.findByText("5");
    fireEvent.click(
      screen.getByRole("button", { name: "Open billing portal" }),
    );

    expect(
      await screen.findByText(
        "We couldn’t open your billing settings. Please try again.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("Customer has no Stripe identifier")).toBeNull();
  });

  it("hides technical cancellation errors behind a user-facing message", async () => {
    mocks.cancelSubscriptionAtPeriodEnd.mockRejectedValue(
      new Error("Subscription update transaction failed"),
    );

    render(
      <TestProvider>
        <SubscriptionConsumer name="feature" />
      </TestProvider>,
    );

    await screen.findByText("5");
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel subscription" }),
    );

    expect(
      await screen.findByText(
        "We couldn’t update your subscription. Please try again.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByText("Subscription update transaction failed"),
    ).toBeNull();
  });
});
