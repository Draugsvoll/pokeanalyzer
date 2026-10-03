import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { expect, test, vi } from "vitest";
import type { User } from "firebase/auth";
import { MEMBERSHIP_PLANS } from "../../../shared/subscriptions/plans";
import { AuthContext } from "../../context/authContextValue";
import { PricingBar } from "./PricingBar";

function renderPricingBar(pricingBar: ReactElement, user: User | null = null) {
  return render(
    <AuthContext.Provider value={{ loading: false, logout: vi.fn(), user }}>
      {pricingBar}
    </AuthContext.Provider>,
  );
}

test("renders only the membership plan columns", () => {
  renderPricingBar(<PricingBar plans={MEMBERSHIP_PLANS} />);

  expect(
    screen.queryByRole("heading", { name: "Choose your membership" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Free" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Collector" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Pro" })).toBeVisible();
  expect(screen.getByText("20 AI credits every month")).toBeVisible();
  expect(screen.getByText("$3.99")).toBeVisible();
  expect(
    screen.getByText(
      "Explore card insights and AI-powered analysis at no cost.",
    ),
  ).toBeVisible();
  expect(screen.getByText("Track 10 cards in portfolio")).toBeVisible();
  expect(document.querySelectorAll(".default-container-inner")).toHaveLength(3);
});

test("renders plan descriptions and features from the supplied configuration", () => {
  const configuredPlan = {
    ...MEMBERSHIP_PLANS[0],
    description: "Configured plan description",
    features: ["Configured plan feature"],
  };

  renderPricingBar(<PricingBar plans={[configuredPlan]} />);

  expect(screen.getByText("Configured plan description")).toBeVisible();
  expect(screen.getByText("Configured plan feature")).toBeVisible();
  expect(screen.queryByText("Track 10 cards in portfolio")).toBeNull();
});

test("renders full pricing cards when embedded and delegates plan actions", () => {
  const chooseCollector = vi.fn();

  renderPricingBar(
    <PricingBar
      currentPlanId="free"
      getPlanAction={(plan) => ({
        disabled: plan.id === "free",
        label: plan.id === "free" ? "Your plan" : `Choose ${plan.name}`,
        onClick: plan.id === "collector" ? chooseCollector : undefined,
      })}
      plans={MEMBERSHIP_PLANS}
    />,
    { uid: "user-1" } as User,
  );

  expect(screen.getByRole("button", { name: "Your plan" })).toBeDisabled();
  expect(screen.queryByText("Current plan")).not.toBeInTheDocument();
  expect(document.querySelector(".pricing-bar__plan--free")).toHaveClass(
    "is-current",
  );
  expect(document.querySelector(".pricing-bar__plan--pro")).not.toHaveClass(
    "is-current",
  );
  expect(screen.getByText("Everything in Free")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Choose Collector" }));
  expect(chooseCollector).toHaveBeenCalledOnce();
});

test("does not highlight a current plan while signed out", () => {
  renderPricingBar(
    <PricingBar currentPlanId="free" plans={MEMBERSHIP_PLANS} />,
  );

  expect(document.querySelector(".pricing-bar__plan.is-current")).toBeNull();
});
