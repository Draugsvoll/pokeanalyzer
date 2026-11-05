import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import {
  MEMBERSHIP_PLANS,
  type MembershipPlan,
} from "../../../shared/subscriptions/plans";
import type { UserSubscription } from "../../subscriptions/types";
import Profile from "./Profile";

const mocks = vi.hoisted(() => ({
  authUser: {
    email: "collector@example.com",
    emailVerified: true,
    uid: "user-1",
  },
  membershipPlans: [] as MembershipPlan[],
  openBillingPortal: vi.fn(),
  startMembershipCheckout: vi.fn(),
  subscription: null as UserSubscription | null,
  updatingSubscription: false,
  unlimitedEbay: false,
  deleteAccount: vi.fn(),
  showNotification: vi.fn(),
}));

vi.mock("../../services/auth", () => ({ deleteAccount: mocks.deleteAccount }));
vi.mock("../../context/notificationContextValue", () => ({
  useNotification: () => ({ showNotification: mocks.showNotification }),
}));

vi.mock("../../firebase", () => ({ db: {} }));

vi.mock("../../ebay/useEbayCredits", () => ({
  useEbayCredits: () => ({
    credits: {
      unlimited: mocks.unlimitedEbay,
      creditsRemaining: 10,
      membershipCreditsRemaining: 0,
      membershipCreditsTotal: 0,
      bonusCreditsRemaining: 10,
    },
    loading: false,
    error: "",
    refreshCredits: vi.fn(),
  }),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  Timestamp: {
    fromMillis: (milliseconds: number) => ({
      toMillis: () => milliseconds,
    }),
  },
}));

vi.mock("../../context/authContextValue", () => ({
  useAuth: () => ({
    loading: false,
    logout: vi.fn(),
    user: mocks.authUser,
  }),
}));

vi.mock("../../subscriptions", () => ({
  useCredits: () => ({
    bonusCreditsRemaining: mocks.subscription?.bonusCreditsRemaining ?? 0,
    creditsRemaining:
      (mocks.subscription?.membershipCreditsRemaining ?? 0) +
      (mocks.subscription?.bonusCreditsRemaining ?? 0),
    creditsTotal:
      (mocks.subscription?.membershipCreditsTotal ?? 0) +
      (mocks.subscription?.bonusCreditsTotal ?? 0),
    membershipCreditsRemaining:
      mocks.subscription?.membershipCreditsRemaining ?? 0,
    membershipCreditsTotal: mocks.subscription?.membershipCreditsTotal ?? 0,
  }),
  useMembershipSubscription: () => ({
    loadingSubscription: false,
    membershipPlans: mocks.membershipPlans,
    openBillingPortal: mocks.openBillingPortal,
    startMembershipCheckout: mocks.startMembershipCheckout,
    subscription: mocks.subscription,
    subscriptionMessage: null,
    updatingSubscription: mocks.updatingSubscription,
  }),
}));

vi.mock("../../components/loginmodal/Loginmodal", () => ({
  default: () => null,
}));

function subscription(
  overrides: Partial<UserSubscription> = {},
): UserSubscription {
  return {
    bonusCreditsRemaining: 0,
    bonusCreditsTotal: 0,
    bonusCreditsUsed: 0,
    cancelAtPeriodEnd: false,
    membershipCreditsRemaining: 0,
    membershipCreditsTotal: 0,
    membershipCreditsUsed: 0,
    planId: "free",
    planName: "Free",
    status: "active",
    ...overrides,
  };
}

function renderProfile() {
  sessionStorage.setItem(
    "user_profile_user-1",
    JSON.stringify({
      createdAt: "2026-01-01T00:00:00.000Z",
      email: "collector@example.com",
      firstName: "Collector",
      uid: "user-1",
    }),
  );

  return render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  mocks.openBillingPortal.mockReset();
  mocks.startMembershipCheckout.mockReset();
  mocks.membershipPlans = MEMBERSHIP_PLANS;
  mocks.subscription = subscription();
  mocks.updatingSubscription = false;
  mocks.unlimitedEbay = false;
  mocks.deleteAccount.mockReset();
  mocks.showNotification.mockReset();
});

test("deletion requires confirmation and can be canceled without a request", async () => {
  renderProfile();
  fireEvent.click(
    await screen.findByRole("button", { name: "Delete account" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Delete your account?" });
  expect(mocks.deleteAccount).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mocks.deleteAccount).not.toHaveBeenCalled();
});

test("uncancelled paid memberships see the cancellation message on the first click", async () => {
  mocks.subscription = subscription({ planId: "pro", planName: "Pro" });
  renderProfile();
  fireEvent.click(
    await screen.findByRole("button", { name: "Delete account" }),
  );
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveTextContent(
    "Cancel your subscription before deleting your account.",
  );
  expect(
    within(dialog).queryByRole("button", { name: "Delete account" }),
  ).not.toBeInTheDocument();
  expect(mocks.deleteAccount).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test.each([
  { planId: "pro" as const, cancelAtPeriodEnd: true },
  { planId: "pro" as const, status: "canceled" as const },
  { planId: "pro" as const, status: "expired" as const },
])(
  "already-cancelled memberships still receive deletion confirmation (%j)",
  async (membership) => {
    mocks.subscription = subscription(membership);
    renderProfile();
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete account" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("You will permanently lose access");
    expect(
      within(dialog).getByRole("button", { name: "Delete account" }),
    ).toBeEnabled();
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  },
);

test("deletion shows loading, prevents duplicate requests, and reports success", async () => {
  let finish!: () => void;
  mocks.deleteAccount.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  renderProfile();
  fireEvent.click(
    await screen.findByRole("button", { name: "Delete account" }),
  );
  const dialog = screen.getByRole("dialog");
  const confirm = within(dialog).getByRole("button", {
    name: "Delete account",
  });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(confirm).toHaveTextContent("Deleting account...");
  expect(confirm).toBeDisabled();
  expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(dialog).toBeInTheDocument();
  expect(mocks.deleteAccount).toHaveBeenCalledExactlyOnceWith(mocks.authUser);
  finish();
  await waitFor(() =>
    expect(mocks.showNotification).toHaveBeenCalledWith(
      "Your account has been deleted.",
      "success",
    ),
  );
});

test("deletion errors preserve the account and allow another attempt", async () => {
  mocks.deleteAccount.mockRejectedValueOnce(
    new Error("Cancel your subscription before deleting your account."),
  );
  renderProfile();
  fireEvent.click(
    await screen.findByRole("button", { name: "Delete account" }),
  );
  const dialog = screen.getByRole("dialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Delete account" }),
  );
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Cancel your subscription",
  );
  expect(screen.getByRole("heading", { name: "Collector" })).toBeVisible();
  expect(mocks.showNotification).not.toHaveBeenCalled();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Delete account" }),
  );
  await waitFor(() =>
    expect(mocks.showNotification).toHaveBeenCalledWith(
      "Your account has been deleted.",
      "success",
    ),
  );
  expect(mocks.deleteAccount).toHaveBeenCalledTimes(2);
});

test("keeps the current plan disabled and starts checkout for an upgrade", async () => {
  renderProfile();

  expect(
    await screen.findByRole("button", { name: "Current plan" }),
  ).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Choose Basic" }));

  expect(mocks.startMembershipCheckout).toHaveBeenCalledOnce();
  expect(mocks.startMembershipCheckout).toHaveBeenCalledWith("basic");
  expect(mocks.openBillingPortal).not.toHaveBeenCalled();
});

test("shows no included credits or credit renewal date for Free", async () => {
  mocks.subscription = subscription({
    currentPeriodEnd: "2026-11-15T00:00:00.000Z",
  });
  renderProfile();

  expect(
    await screen.findByText("See plans below for more credits and features."),
  ).toBeVisible();
  expect(
    screen.getByText(
      "You can browse cards, explore prices, and manage a small collection.",
    ),
  ).toBeVisible();
  expect(screen.queryByText(/AI credits renew/)).not.toBeInTheDocument();
  expect(
    screen.getByLabelText("AI credits: 0 remaining, 0 per month"),
  ).toHaveTextContent(/0\s*AI credits\s*0 renewed monthly/);
  expect(
    screen.getByLabelText("Market credits: 10 remaining, 0 per month"),
  ).toHaveTextContent(/10\s*Market credits\s*0 renewed monthly/);
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});

test("keeps existing Free credit renewal information alongside the footer", async () => {
  mocks.subscription = subscription({
    membershipCreditsTotal: 10,
    currentPeriodEnd: "2026-11-15T00:00:00.000Z",
  });
  renderProfile();

  expect(
    await screen.findByText(
      "You can browse cards, explore prices, and manage a small collection.",
    ),
  ).toBeVisible();
  expect(screen.getByText(/AI credits renew/)).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Manage plan" }),
  ).not.toBeInTheDocument();
});

test("uses the billing portal when an active subscriber changes plans", async () => {
  mocks.subscription = subscription({
    currentPeriodEnd: "2026-11-15T00:00:00.000Z",
    bonusCreditsRemaining: 5,
    membershipCreditsRemaining: 20,
    membershipCreditsTotal: 20,
    planId: "basic",
    planName: "Basic",
    stripeSubscriptionId: "sub_123",
  });
  renderProfile();

  expect(
    await screen.findByRole("button", { name: "Current plan" }),
  ).toBeDisabled();
  expect(
    screen.getByText(
      "To cancel your membership, switch to the Free plan below.",
      { selector: "p" },
    ),
  ).toBeVisible();
  expect(
    screen.queryByText(
      "You can browse cards, explore prices, and manage a small collection.",
    ),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Next billing date/)).toBeVisible();
  expect(
    screen.getByLabelText("AI credits: 25 remaining, 20 per month"),
  ).toHaveTextContent(/25\s*AI credits\s*20 renewed monthly/);

  fireEvent.click(screen.getByRole("button", { name: "Switch plan" }));
  fireEvent.click(screen.getByRole("button", { name: "Switch to Free" }));

  expect(mocks.openBillingPortal).toHaveBeenCalledTimes(2);
  expect(mocks.startMembershipCheckout).not.toHaveBeenCalled();
});

test("disables a scheduled downgrade and shows its effective date", async () => {
  const currentPeriodEnd = "2026-11-15T00:00:00.000Z";
  mocks.subscription = subscription({
    cancelAtPeriodEnd: true,
    currentPeriodEnd,
    membershipCreditsRemaining: 20,
    membershipCreditsTotal: 20,
    planId: "basic",
    planName: "Basic",
    stripeSubscriptionId: "sub_123",
  });
  renderProfile();

  const scheduledDowngrade = await screen.findByRole("button", {
    name: `Switching ${new Date(currentPeriodEnd).toLocaleDateString("en-US")}`,
  });

  expect(scheduledDowngrade).toBeDisabled();
  expect(mocks.openBillingPortal).not.toHaveBeenCalled();
  expect(mocks.startMembershipCheckout).not.toHaveBeenCalled();
});

test("shows unlimited eBay searches without a numeric allowance for Pro", async () => {
  mocks.unlimitedEbay = true;
  renderProfile();
  const balance = await screen.findByLabelText("Unlimited Market credits");
  expect(balance).toHaveTextContent("Unlimited monthly");
  expect(balance).not.toHaveTextContent("renewed monthly");
});
