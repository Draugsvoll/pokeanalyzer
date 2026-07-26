import { doc, getDoc, Timestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { useAuth } from "../../context/authContextValue";
import "./Profile.scss";
import { getUserProfileSessionKey } from "../../utils/cache";
import Button from "../../components/button/Button";
import LoginModal from "../../components/loginmodal/Loginmodal";
import type { UserProfile } from "../../types/user.types";
import { logClientError } from "../../utils/logClientError";
import { useInitials } from "../../hooks/useInitials";
import { formatTimestampDate } from "../../utils/timestamp";
import { BadgeCheck, Coins, Crown, Leaf, LogOut, Sparkles } from "lucide-react";
import {
  useCredits,
  useMembershipSubscription,
} from "../../subscriptions";

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
    creditMessage,
    creditsRemaining,
    creditsTotal,
    membershipCreditsRemaining,
    membershipCreditsTotal,
    topUpCredits,
    updatingCredits,
  } = useCredits(subscription);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const canStartMembershipCheckout =
    !subscription?.stripeSubscriptionId ||
    subscription.status === "canceled" ||
    subscription.status === "expired";
  const canManageBilling = Boolean(
    subscription?.stripeSubscriptionId &&
    subscription.status !== "canceled" &&
    subscription.status !== "expired"
  );
  const canUseMembership =
    subscription?.status === "active" || subscription?.status === "trialing";
  const profileInitial = useInitials(profile?.firstName?.trim() || profile?.email);
  const profileName = profile?.firstName?.trim() || profile?.username?.trim();
  const profileHeading = profileName || profile?.email;
  const planOptions = membershipPlans.filter(
    (plan) => plan.id === "free" || plan.id === "collector" || plan.id === "pro"
  );
  const creditPercentage = creditsTotal > 0
    ? Math.min(100, Math.max(0, (creditsRemaining / creditsTotal) * 100))
    : 0;

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  useEffect(() => {
    const fetchProfile = async () => {
      if (!authUser) {
        setProfile(null);
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
              parsedProfile.createdAt.seconds * 1000
            );
          }
          setProfile(parsedProfile);
          return;
        }

        const userRef = doc(db, "users", authUser.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          setProfile(null);
          setError("Logged in but no user profile found.");
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
        setError("Failed to fetch user data.");
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [authUser]);

  if (authLoading || loading) return <h1>Loading...</h1>;

  if (!authUser) {
    return (
      <div className="profile">
        <h1>User not logged in</h1>
        <p>
          <button
            onClick={() => navigate("/signup")}
            className="profile__link"
          >
            Sign up
          </button>
          {" or "}
          <button
            onClick={() => setShowLoginModal(true)}
            className="profile__link"
          >
            log in
          </button>
          {" to access your profile."}
        </p>
        <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1>{error}</h1>
        <Button onClick={handleLogout}>Log out</Button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div>
        <h1>Logged in but no profile data found</h1>
        <Button onClick={handleLogout}>Log out</Button>
      </div>
    );
  }

  return (
    <div className="profile">
      <h1>My Profile</h1>

      <div className="profile__card">
        <header className="profile__identity">
          <div className="profile__identity-main">
            {profile.avatar?.trim() ? (
              <img
                className="profile__avatar"
                src={profile.avatar.trim()}
                alt={profileName ? `${profileName}'s profile avatar` : "Profile avatar"}
              />
            ) : (
              <div className="profile__avatar profile__avatar--fallback">
                {profileInitial}
              </div>
            )}
            <div className="profile__identity-copy">
              <span className="profile__eyebrow">Account</span>
              <div className="profile__identity-title">
                <h2>{profileHeading}</h2>
                {authUser.emailVerified && (
                  <span className="profile__verified-badge">
                    <BadgeCheck aria-hidden="true" /> Verified
                  </span>
                )}
              </div>
              {profileName && <p>{profile.email}</p>}
              <div className="profile__identity-meta">
                <span>
                  Member since: <strong> {formatTimestampDate(profile.createdAt)}</strong>
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
            <article className="profile__plan-card">
              <div className="profile__section-heading">
                <span className="profile__eyebrow">Current plan</span>
                {subscription && (
                  <span className={`profile__status profile__status--${canUseMembership ? "active" : "inactive"}`}>
                    <i aria-hidden="true" />
                    {subscription.status.replace("_", " ")}
                  </span>
                )}
              </div>
              <div className="profile__plan-title">
                <span className="profile__plan-icon" aria-hidden="true"><Crown /></span>
                <div>
                  <h3>
                    {loadingSubscription
                      ? "Loading..."
                      : subscription?.planName ?? "No membership"}
                  </h3>
                  <p>
                    {subscription?.planId === "free"
                      ? "Your free account plan"
                      : subscription
                        ? `${membershipCreditsTotal} credits every month`
                        : "No active plan found"}
                  </p>
                </div>
              </div>
              {(subscription?.currentPeriodEnd || (subscription && subscription.planId !== "free" && subscription.stripeSubscriptionId)) && (
                <div className="profile__period-row">
                  {subscription?.currentPeriodEnd && (
                    <small className="profile__period">
                      {subscription.cancelAtPeriodEnd ? "Access until" : "Next billing date"}{" "}
                      <strong>{new Date(subscription.currentPeriodEnd).toLocaleDateString()}</strong>
                      {subscription.cancelAtPeriodEnd && " · Cancelling"}
                    </small>
                  )}
                  {subscription && subscription.planId !== "free" && subscription.stripeSubscriptionId && (
                    <Button
                      variant="secondary"
                      disabled={updatingSubscription}
                      onClick={() => void openBillingPortal()}
                      aria-busy={updatingSubscription}
                    >
                      {updatingSubscription ? (
                        <span
                          className="profile__purchase-spinner"
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

            <article className="profile__credits-card">
              <div className="profile__section-heading">
                <span className="profile__eyebrow">Credit balance</span>
                <span className="profile__credits-icon" aria-hidden="true"><Coins /></span>
              </div>
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
                <span>Monthly credits <strong>{membershipCreditsRemaining}/{membershipCreditsTotal}</strong></span>
                <span>Extra credits <strong>{bonusCreditsRemaining}</strong></span>
              </div>
            </article>
          </div>

          <div className="profile__plan-actions">
            <div className="profile__upgrade-copy">
              <span className="profile__eyebrow">Plans and credits</span>
              <h3>Choose how you want to add credits</h3>
            </div>

            <div className="profile__purchase-group-heading">
              <span>Membership plans</span>
              <small>Renews monthly</small>
            </div>

            {(subscriptionMessage || creditMessage) && (
              <div className="profile__billing-notices" aria-live="polite">
                {subscriptionMessage && (
                  <small>{subscriptionMessage}</small>
                )}
                {creditMessage && <small className="is-warning">{creditMessage}</small>}
              </div>
            )}

            <div className="profile__purchase-options">
              {planOptions.map((plan) => {
                const isFreePlan = plan.id === "free";
                const planIsCurrent = subscription?.planId === plan.id;
                const switchToFreeIsScheduled = Boolean(
                  isFreePlan &&
                  subscription?.planId !== "free" &&
                  subscription?.cancelAtPeriodEnd
                );
                const useBillingPortal = Boolean(
                  !isFreePlan && !canStartMembershipCheckout && canManageBilling
                );
                const PlanIcon = isFreePlan
                  ? Leaf
                  : plan.id === "pro"
                    ? Sparkles
                    : Crown;
                const planAction = () => {
                  if (isFreePlan) {
                    return openBillingPortal();
                  }
                  if (useBillingPortal) return openBillingPortal();
                  return startMembershipCheckout(plan.id);
                };

                return (
                  <article
                    key={plan.id}
                    className={`profile__purchase-card${isFreePlan ? " profile__purchase-card--free" : plan.id === "collector" ? " profile__purchase-card--collector" : plan.id === "pro" ? " profile__purchase-card--pro" : ""}${planIsCurrent ? " is-current" : ""}${switchToFreeIsScheduled ? " is-scheduled" : ""}`}
                  >
                    <span className="profile__purchase-icon" aria-hidden="true">
                      <PlanIcon />
                    </span>
                    <span className="profile__purchase-name">{plan.name}</span>
                    <strong>{isFreePlan ? "Free forever" : `${plan.credits} credits`}</strong>
                    <small>
                      {isFreePlan
                        ? "No monthly fee · No subscription"
                        : `${plan.price} ${plan.currency} / month`}
                    </small>
                    <button
                      type="button"
                      className="profile__purchase-cta"
                      disabled={
                        planIsCurrent ||
                        switchToFreeIsScheduled ||
                        updatingSubscription ||
                        (isFreePlan
                          ? !canManageBilling
                          : !canStartMembershipCheckout && !canManageBilling)
                      }
                      onClick={() => void planAction()}
                      aria-busy={updatingSubscription && !planIsCurrent && !switchToFreeIsScheduled}
                    >
                      {planIsCurrent
                        ? "Current plan"
                        : switchToFreeIsScheduled
                          ? subscription?.currentPeriodEnd
                            ? `Switching ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                            : "Switch scheduled"
                        : updatingSubscription
                          ? (
                            <span
                              className="profile__purchase-spinner"
                              aria-label="Opening checkout"
                            />
                          )
                          : isFreePlan
                            ? "Switch to Free"
                          : useBillingPortal
                            ? "Switch plan"
                            : `Choose ${plan.name}`}
                    </button>
                  </article>
                );
              })}
            </div>

            <div className="profile__purchase-divider" aria-hidden="true">
              <span>or</span>
            </div>

            <div className="profile__purchase-group-heading profile__purchase-group-heading--one-time">
              <span>One-time payment</span>
            </div>

            <div className="profile__top-up-row">
              <article className="profile__purchase-card profile__purchase-card--top-up">
                <span className="profile__purchase-icon" aria-hidden="true"><Coins /></span>
                <div className="profile__top-up-copy">
                  <span className="profile__purchase-name">Credit top-up</span>
                  <strong>100 extra credits</strong>
                  <small>One-time payment · No subscription</small>
                </div>
                <button
                  type="button"
                  className="profile__purchase-cta"
                  disabled={!canUseMembership || updatingCredits}
                  onClick={() => void topUpCredits()}
                  aria-busy={updatingCredits}
                >
                  {updatingCredits ? (
                    <span
                      className="profile__purchase-spinner"
                      aria-label="Opening checkout"
                    />
                  ) : (
                    "Buy extra credits"
                  )}
                </button>
              </article>
            </div>

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
