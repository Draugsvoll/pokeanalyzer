import { fireEvent, render, screen } from "@testing-library/react";
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
}));

vi.mock("../../firebase", () => ({ db: {} }));

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
    bonusCreditsRemaining: 0,
    creditsRemaining: 3,
    creditsTotal: 3,
    membershipCreditsRemaining: 3,
    membershipCreditsTotal: 3,
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
    membershipCreditsRemaining: 3,
    membershipCreditsTotal: 3,
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
});

test("keeps the current plan disabled and starts checkout for an upgrade", async () => {
  renderProfile();

  expect(
    await screen.findByRole("button", { name: "Your plan" }),
  ).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Choose Collector" }));

  expect(mocks.startMembershipCheckout).toHaveBeenCalledOnce();
  expect(mocks.startMembershipCheckout).toHaveBeenCalledWith("collector");
  expect(mocks.openBillingPortal).not.toHaveBeenCalled();
});

test("uses the billing portal when an active subscriber changes plans", async () => {
  mocks.subscription = subscription({
    membershipCreditsRemaining: 20,
    membershipCreditsTotal: 20,
    planId: "collector",
    planName: "Collector",
    stripeSubscriptionId: "sub_123",
  });
  renderProfile();

  expect(
    await screen.findByRole("button", { name: "Your plan" }),
  ).toBeDisabled();

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
    planId: "collector",
    planName: "Collector",
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
