import { doc, getDoc, Timestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { useAuth } from "../../context/authContextValue";
import "./Profile.scss";
import { getUserProfileSessionKey } from "../../utils/cache";
import Button from "../../components/button/Button";
import type { UserProfile } from "../../types/user.types";
import { logClientError } from "../../utils/logClientError";
import { useInitials } from "../../hooks/useInitials";
import { formatTimestampDate } from "../../utils/timestamp";
import {
  BadgeCheck,
  CircleAlert,
  Coins,
  Crown,
  LogIn,
  LogOut,
  UserRound,
} from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { useCredits, useMembershipSubscription } from "../../subscriptions";
import type {
  MembershipPlan,
  SubscriptionStatus,
} from "../../subscriptions/types";
import { LoadingState } from "../../components/loadingState/LoadingState";
import LoginModal from "../../components/loginmodal/Loginmodal";
import {
  PricingBar,
  type PricingBarAction,
} from "../../components/pricingBar/PricingBar";

const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: "Active",
  canceled: "Canceled",
  expired: "Expired",
  past_due: "Payment due",
  paused: "Paused",
  trialing: "Trial",
};

export default function Profile() {
  const navigate = useNavigate();
  const { user: authUser, loading: authLoading, logout } = useAuth();
  const {
    loadingSubscription,
    membershipPlans,
    openBillingPortal,
    startMembershipCheckout,
    subscription,
    subscriptionMessage,
    updatingSubscription,
  } = useMembershipSubscription();
  const {
    bonusCreditsRemaining,
    creditsRemaining,
    creditsTotal,
    membershipCreditsRemaining,
    membershipCreditsTotal,
  } = useCredits(subscription);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const canStartMembershipCheckout =
    !subscription?.stripeSubscriptionId ||
    subscription.status === "canceled" ||
    subscription.status === "expired";
  const canManageBilling = Boolean(
    subscription?.stripeSubscriptionId &&
    subscription.status !== "canceled" &&
    subscription.status !== "expired",
  );
  const canUseMembership =
    subscription?.status === "active" || subscription?.status === "trialing";
  const profileInitial = useInitials(
    profile?.firstName?.trim() || profile?.email,
  );
  const profileName = profile?.firstName?.trim() || profile?.username?.trim();
  const profileHeading = profileName || profile?.email;
  const planOptions = membershipPlans.filter(
    (plan) =>
      plan.id === "free" || plan.id === "collector" || plan.id === "pro",
  );
  const creditPercentage =
    creditsTotal > 0
      ? Math.min(100, Math.max(0, (creditsRemaining / creditsTotal) * 100))
      : 0;

  const getPlanAction = (plan: MembershipPlan): PricingBarAction => {
    const isFreePlan = plan.id === "free";
    const planIsCurrent = subscription?.planId === plan.id;
    const switchToFreeIsScheduled = Boolean(
      isFreePlan &&
      subscription?.planId !== "free" &&
      subscription?.cancelAtPeriodEnd,
    );
    const useBillingPortal = Boolean(
      !isFreePlan && !canStartMembershipCheckout && canManageBilling,
    );

    let label = `Choose ${plan.name}`;
    if (planIsCurrent) label = "Your plan";
    else if (switchToFreeIsScheduled) {
      label = subscription?.currentPeriodEnd
        ? `Switching ${new Date(subscription.currentPeriodEnd).toLocaleDateString("en-US")}`
        : "Switch scheduled";
    } else if (isFreePlan) label = "Switch to Free";
    else if (useBillingPortal) label = "Switch plan";

    return {
      busy: updatingSubscription && !planIsCurrent && !switchToFreeIsScheduled,
      disabled:
        planIsCurrent ||
        switchToFreeIsScheduled ||
        updatingSubscription ||
        (isFreePlan
          ? !canManageBilling
          : !canStartMembershipCheckout && !canManageBilling),
      label,
      onClick: () => {
        if (isFreePlan || useBillingPortal) return void openBillingPortal();
        return void startMembershipCheckout(plan.id);
      },
    };
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  useEffect(() => {
    const fetchProfile = async () => {
      if (!authUser) {
        setProfile(null);
        setError(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const cacheKey = getUserProfileSessionKey(authUser.uid);
        const cachedProfile = sessionStorage.getItem(cacheKey);

        if (cachedProfile) {
          const parsedProfile = JSON.parse(cachedProfile);
          if (parsedProfile.createdAt?.seconds) {
            parsedProfile.createdAt = Timestamp.fromMillis(
              parsedProfile.createdAt.seconds * 1000,
            );
          }
          setProfile(parsedProfile);
          return;
        }

        const userRef = doc(db, "users", authUser.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          setProfile(null);
          setError("We couldn’t find your profile details.");
          return;
        }

        const userData: UserProfile = {
          ...userSnap.data(),
          uid: authUser.uid,
          email: userSnap.data().email ?? authUser.email ?? "",
        };

        sessionStorage.setItem(cacheKey, JSON.stringify(userData));
        setProfile(userData);
      } catch (err) {
        logClientError("Failed to fetch user data", err);
        setError("We couldn’t load your profile. Please try again.");
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [authUser, loadAttempt]);

  if (authLoading) {
    return (
      <div className="profile profile--status" aria-busy="true">
        <LoadingState>Checking your session</LoadingState>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="profile profile--guest">
        <section
          aria-labelledby="profile-guest-title"
          className="profile__guest-state default-container ui-render-fade"
        >
          <span className="profile__status-icon" aria-hidden="true">
            <UserRound />
          </span>
          <h1 id="profile-guest-title">Log in to view your account</h1>
          <p>
            Your profile, credits, membership, and billing stay with your
            account.
          </p>
          <div className="profile__status-actions">
            <Button onClick={() => setLoginOpen(true)}>
              <LogIn aria-hidden="true" /> Log in
            </Button>
            <Button fill="ghost" onClick={() => navigate("/signup")}>
              Create account
            </Button>
          </div>
        </section>
        <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
      </div>
    );
  }

  if (loading || (!error && profile?.uid !== authUser.uid)) {
    return (
      <div className="profile profile--status" aria-busy="true">
        <header className="profile__page-heading">
          <span className="profile__eyebrow">Profile</span>
          <h1>My Account</h1>
        </header>
        <section className="profile__loading-state default-container">
          <LoadingState>Loading account details</LoadingState>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="profile profile--status">
        <section
          className="profile__status-card default-container"
          role="alert"
        >
          <span className="profile__status-icon" aria-hidden="true">
            <CircleAlert />
          </span>
          <span className="profile__eyebrow">Account unavailable</span>
          <h1>We couldn&apos;t load your account.</h1>
          <p>{error}</p>
          <div className="profile__status-actions">
            <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
              Try again
            </Button>
            <Button fill="ghost" onClick={() => void handleLogout()}>
              Log out
            </Button>
          </div>
        </section>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile profile--status">
        <section
          className="profile__status-card default-container"
          role="alert"
        >
          <span className="profile__status-icon" aria-hidden="true">
            <CircleAlert />
          </span>
          <span className="profile__eyebrow">Profile unavailable</span>
          <h1>No profile data was found.</h1>
          <p>Your account is signed in, but its profile could not be loaded.</p>
          <div className="profile__status-actions">
            <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
              Try again
            </Button>
            <Button fill="ghost" onClick={() => void handleLogout()}>
              Log out
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="profile">
      <header className="profile__page-heading">
        <span className="profile__eyebrow">Profile</span>
        <h1>My Account</h1>
      </header>

      <div className="profile__card default-container">
        <header className="profile__identity">
          <div className="profile__identity-main">
            {profile.avatar?.trim() ? (
              <img
                className="profile__avatar"
                src={profile.avatar.trim()}
                alt={
                  profileName
                    ? `${profileName}'s profile avatar`
                    : "Profile avatar"
                }
              />
            ) : (
              <div className="avatar-initials profile__avatar profile__avatar--fallback">
                {profileInitial}
              </div>
            )}
            <div className="profile__identity-copy">
              <span className="profile__eyebrow">Personal details</span>
              <div className="profile__identity-title">
                <h2>{profileHeading}</h2>
                {authUser.emailVerified && (
                  <Badge accent="green" size="sm" weight="strong">
                    <BadgeCheck aria-hidden="true" /> Verified
                  </Badge>
                )}
              </div>
              <div className="profile__identity-details">
                {profileName && <p>{profile.email}</p>}
                <span className="profile__joined">
                  Joined{" "}
                  <strong>{formatTimestampDate(profile.createdAt)}</strong>
                </span>
              </div>
            </div>
          </div>
          <div className="profile__logout-slot">
            <Button variant="danger" fullWidth onClick={handleLogout}>
              <LogOut aria-hidden="true" />
              Log out
            </Button>
          </div>
        </header>

        <section className="profile__subscription">
          <div className="profile__membership-overview">
            <article
              className={`profile__plan-card${loadingSubscription ? " is-loading" : ""}`}
              aria-busy={loadingSubscription}
            >
              <div className="profile__section-heading">
                <span className="profile__eyebrow">Current plan</span>
                {subscription && (
                  <span
                    className={`profile__status profile__status--${canUseMembership ? "active" : "inactive"}`}
                  >
                    <i aria-hidden="true" />
                    {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                  </span>
                )}
              </div>
              {loadingSubscription && (
                <div className="profile__summary-loading">
                  <span
                    className="app-btn__spinner profile__summary-spinner"
                    role="status"
                    aria-label="Loading current plan"
                  />
                </div>
              )}
              <div className="profile__plan-title">
                <span className="profile__plan-icon" aria-hidden="true">
                  <Crown />
                </span>
                <div>
                  <h3>
                    {loadingSubscription
                      ? "Loading..."
                      : (subscription?.planName ?? "No membership")}
                  </h3>
                  <p>
                    {subscription
                      ? `${membershipCreditsTotal} credits every month`
                      : "No active plan found"}
                  </p>
                </div>
              </div>
              {(subscription?.currentPeriodEnd ||
                (subscription &&
                  subscription.planId !== "free" &&
                  subscription.stripeSubscriptionId)) && (
                <div className="profile__period-row">
                  {subscription?.currentPeriodEnd && (
                    <small className="profile__period">
                      {subscription.planId === "free"
                        ? "Credits renew"
                        : subscription.cancelAtPeriodEnd
                          ? "Access until"
                          : "Next billing date"}{" "}
                      <strong>
                        {new Date(
                          subscription.currentPeriodEnd,
                        ).toLocaleDateString("en-US")}
                      </strong>
                      {subscription.cancelAtPeriodEnd &&
                        " · Cancellation scheduled"}
                    </small>
                  )}
                  {subscription &&
                    subscription.planId !== "free" &&
                    subscription.stripeSubscriptionId &&
                    !subscription.cancelAtPeriodEnd && (
                      <Button
                        variant="secondary"
                        disabled={updatingSubscription}
                        onClick={() => void openBillingPortal()}
                        aria-busy={updatingSubscription}
                      >
                        {updatingSubscription ? (
                          <span
                            className="app-btn__spinner"
                            aria-label="Opening billing portal"
                          />
                        ) : (
                          "Manage plan"
                        )}
                      </Button>
                    )}
                </div>
              )}
            </article>

            <article
              className={`profile__credits-card${loadingSubscription ? " is-loading" : ""}`}
              aria-busy={loadingSubscription}
            >
              <div className="profile__section-heading">
                <span className="profile__eyebrow">Credit balance</span>
                <span className="profile__credits-icon" aria-hidden="true">
                  <Coins />
                </span>
              </div>
              {loadingSubscription && (
                <div className="profile__summary-loading">
                  <span
                    className="app-btn__spinner profile__summary-spinner"
                    role="status"
                    aria-label="Loading credit balance"
                  />
                </div>
              )}
              <div className="profile__credits-total">
                <strong>{subscription ? creditsRemaining : 0}</strong>
                <span>/ {subscription ? creditsTotal : 0}</span>
              </div>
              <div
                className="profile__credits-progress"
                role="progressbar"
                aria-label="Credits remaining"
                aria-valuemin={0}
                aria-valuemax={creditsTotal}
                aria-valuenow={creditsRemaining}
              >
                <span style={{ width: `${creditPercentage}%` }} />
              </div>
              <div className="profile__credit-breakdown">
                <span>
                  Monthly credits{" "}
                  <strong>
                    {membershipCreditsRemaining}/{membershipCreditsTotal}
                  </strong>
                </span>
                <span>
                  Extra credits <strong>{bonusCreditsRemaining}</strong>
                </span>
              </div>
            </article>
          </div>

          <div className="profile__plan-actions">
            {subscriptionMessage && (
              <div className="profile__billing-notices" aria-live="polite">
                <small>{subscriptionMessage}</small>
              </div>
            )}

            <header className="profile__pricing-heading">
              <span className="profile__eyebrow">Plans and credits</span>
              <h2>Choose your membership</h2>
            </header>

            <PricingBar
              currentPlanId={subscription?.planId}
              getPlanAction={getPlanAction}
              plans={planOptions}
            />

            {canUseMembership &&
              subscription &&
              subscription.planId !== "free" &&
              subscription.stripeSubscriptionId &&
              !subscription.cancelAtPeriodEnd && (
                <div className="profile__billing-tools">
                  <Button
                    variant="danger"
                    disabled={updatingSubscription}
                    onClick={() => void openBillingPortal()}
                  >
                    Cancel subscription
                  </Button>
                </div>
              )}
          </div>
        </section>
      </div>
    </div>
  );
}
