import { Check } from "lucide-react";
import type {
  MembershipPlan,
  MembershipPlanId,
} from "../../../shared/subscriptions/plans";
import { useAuth } from "../../context/authContextValue";
import { getCustomColors, type CustomColors } from "../../utils/customStylings";
import Button from "../button/Button";
import "./PricingBar.scss";

export type PricingBarAction = {
  busy?: boolean;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
};

type PricingBarProps = {
  currentPlanId?: MembershipPlanId;
  getPlanAction?: (plan: MembershipPlan) => PricingBarAction | undefined;
  plans: readonly MembershipPlan[];
};

const PLAN_ACCENTS: Record<MembershipPlanId, CustomColors> = {
  free: "teal",
  collector: "blue",
  pro: "purple",
};

function formatPrice(plan: MembershipPlan) {
  if (plan.price === 0) return "$0";

  return new Intl.NumberFormat("en-US", {
    currency: plan.currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(plan.price);
}

export function PricingBar({
  currentPlanId,
  getPlanAction,
  plans,
}: PricingBarProps) {
  const { user } = useAuth();

  return (
    <div className="pricing-bar">
      {plans.map((plan) => {
        const accent = PLAN_ACCENTS[plan.id];
        const action = getPlanAction?.(plan);
        const current = Boolean(user && currentPlanId === plan.id);

        return (
          <article
            className={`pricing-bar__plan pricing-bar__plan--${plan.id} default-container-inner${current ? " is-current" : ""}`}
            key={plan.id}
            style={getCustomColors(accent)}
          >
            <div className="pricing-bar__plan-heading">
              <h3>{plan.name}</h3>
            </div>

            <p className="pricing-bar__description">{plan.description}</p>

            <div className="pricing-bar__price">
              <strong>{formatPrice(plan)}</strong>
              <span>/mo</span>
            </div>

            <small className="pricing-bar__billing-note">
              {plan.price === 0 ? "No card required." : "Billed monthly."}
            </small>

            <ul className="pricing-bar__features">
              {plan.features.map((feature) => (
                <li key={feature}>
                  <Check aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>

            {action && (
              <Button
                aria-busy={action.busy}
                disabled={action.disabled}
                fill={current ? "soft" : "ghost"}
                fullWidth
                onClick={action.onClick}
                size="large"
                style={getCustomColors(accent)}
              >
                {action.busy ? (
                  <span
                    aria-label="Opening billing settings"
                    className="app-btn__spinner"
                  />
                ) : (
                  action.label
                )}
              </Button>
            )}
          </article>
        );
      })}
    </div>
  );
}
