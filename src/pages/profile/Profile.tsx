import { doc, getDoc, Timestamp } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "../../firebase";
import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import "./Profile.scss";
import type { PokemonCard as PokemonCardType } from "../../types/pokemon";
import { getUserProfileSessionKey } from "../../utils/cache";
import { PokemonCard } from "../../components/pokemonCard/PokemonCard";
import { GridView } from "../../components/gridView/GridView";
import Button from "../../components/button/Button";
import type { UserProfile } from "../../types/user.types";
import { logClientError } from "../../utils/logClientError";
import { useInitials } from "../../hooks/useInitials";
import { usePokemonPortfolio } from "../../hooks/pokemonPortfolio";
import { formatTimestampString } from "../../utils/timestamp";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { getTcgPlayerMarketPrice } from "../../utils/pokemonPricing";
import {
  useCredits,
  useMembershipSubscription,
  type MembershipPlanId,
} from "../../subscriptions";

type EstimatedValueSource = "tcgplayer" | "cardmarket";
type PortfolioSort = "default" | "price_desc" | "price_asc";

function getEstimatedCardPrice(
  card: PokemonCardType,
  source: EstimatedValueSource
) {
  if (source === "tcgplayer") {
    return getTcgPlayerMarketPrice(card.tcgplayer?.prices);
  }

  return card.cardmarket?.prices.trendPrice;
}

export default function Profile() {
  const { user: authUser, loading: authLoading, logout } = useAuth();
  const { portfolio } = usePortfolioCache();
  const { removePokemonFromPortfolio, updatePokemonQuantity } = usePokemonPortfolio();
  const {
    cancelAtPeriodEnd,
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
    bonusCreditsTotal,
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
  const [updatingQuantityId, setUpdatingQuantityId] = useState<string | null>(null);
  const [pendingQuantity, setPendingQuantity] = useState<{
    cardId: string;
    quantity: number;
  } | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{
    cardId: string;
    cardName: string;
  } | null>(null);
  const [estimatedValueSource, setEstimatedValueSource] =
    useState<EstimatedValueSource>("tcgplayer");
  const [portfolioSort, setPortfolioSort] = useState<PortfolioSort>("default");
  const [selectedPlanId, setSelectedPlanId] =
    useState<MembershipPlanId>("collector");
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
  const estimatedCollectionValue = portfolio.reduce((total, card) => {
    const marketPrice = getEstimatedCardPrice(card, estimatedValueSource);
    if (marketPrice == null) return total;

    return total + marketPrice * (card.quantity ?? 1);
  }, 0);
  const pricedCardsCount = portfolio.filter(
    (card) => getEstimatedCardPrice(card, estimatedValueSource) != null
  ).length;
  const missingPriceCount = portfolio.length - pricedCardsCount;
  const missingPriceMessage =
    missingPriceCount === 0
      ? null
      : `${missingPriceCount} card${missingPriceCount === 1 ? "" : "s"} missing price`;
  const estimatedCollectionValueLabel = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: estimatedValueSource === "tcgplayer" ? "USD" : "EUR",
  }).format(estimatedCollectionValue);
  const sortedPortfolio = useMemo(() => {
    if (portfolioSort === "default") return portfolio;

    return [...portfolio].sort((firstCard, secondCard) => {
      const firstPrice = getEstimatedCardPrice(firstCard, estimatedValueSource);
      const secondPrice = getEstimatedCardPrice(secondCard, estimatedValueSource);

      if (firstPrice == null && secondPrice == null) return 0;
      if (firstPrice == null) return 1;
      if (secondPrice == null) return -1;

      return portfolioSort === "price_desc"
        ? secondPrice - firstPrice
        : firstPrice - secondPrice;
    });
  }, [estimatedValueSource, portfolio, portfolioSort]);

  const requestQuantityChange = (card: PokemonCardType, amount: number) => {
    if (updatingQuantityId) return;

    const currentQuantity = pendingQuantity?.cardId === card.id
      ? pendingQuantity.quantity
      : card.quantity ?? 1;
    const nextQuantity = currentQuantity + amount;
    if (nextQuantity < 1) return;

    setPendingQuantity({
      cardId: card.id,
      quantity: nextQuantity,
    });
  };

  const confirmQuantityChange = async () => {
    if (!pendingQuantity) return;

    setUpdatingQuantityId(pendingQuantity.cardId);
    await updatePokemonQuantity(pendingQuantity.cardId, pendingQuantity.quantity);
    setUpdatingQuantityId(null);
    setPendingQuantity(null);
  };

  const confirmRemoval = async () => {
    if (!pendingRemoval) return;

    await removePokemonFromPortfolio(pendingRemoval.cardId, false);
    setPendingRemoval(null);
  };

  useEffect(() => {
    if (!pendingQuantity && !pendingRemoval) return;

    const cancelWhenClickingOutside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".profile__quantity-confirm, .profile__quantity-control, .profile__quantity-display")
      ) return;
      setPendingQuantity(null);
      setPendingRemoval(null);
    };

    document.addEventListener("pointerdown", cancelWhenClickingOutside);
    return () => document.removeEventListener("pointerdown", cancelWhenClickingOutside);
  }, [pendingQuantity, pendingRemoval]);

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

  if (!authUser) return <h1>User not logged in</h1>;

  if (error) {
    return (
      <div>
        <h1>{error}</h1>
        <Button onClick={logout}>Log out</Button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div>
        <h1>Logged in but no profile data found</h1>
        <Button onClick={logout}>Log out</Button>
      </div>
    );
  }

  return (
    <div className="profile">
      <h1>My Profile</h1>

      <div className="profile__card">
        {profile.avatar?.trim() ? (
          <img
            className="profile__avatar"
            src={profile.avatar.trim()}
            alt={profile.username ?? "Profile avatar"}
          />
        ) : (
          <div className="profile__avatar profile__avatar--fallback">
            {profileInitial}
          </div>
        )}
        <p>
          <b>Username:</b> {profile.username}
        </p>
        <p>
          <b>Email:</b> {profile.email}
        </p>
        <p>
          <b>User ID:</b> {authUser.uid}
        </p>
        <p>
          <b>Joined:</b> {formatTimestampString(profile.createdAt)}
        </p>
        <section className="profile__subscription">
          <div>
            <span>Membership</span>
            <strong>
              {loadingSubscription
                ? "Loading..."
                : subscription
                  ? `${subscription.planName} (${subscription.status.replace("_", " ")})`
                  : "No membership found"}
            </strong>
            {subscription?.currentPeriodEnd && (
              <small>
                {subscription.cancelAtPeriodEnd ? "Access until" : "Billing period ends"}{" "}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                {subscription.cancelAtPeriodEnd ? " - canceling" : ""}
              </small>
            )}
            <small>
              {subscription
                ? `${creditsRemaining}/${creditsTotal} credits remaining`
                : "No credits available"}
            </small>
            {subscription && (
              <small>
                Membership {membershipCreditsRemaining}/{membershipCreditsTotal}
                {" - "}
                Bonus {bonusCreditsRemaining}/{bonusCreditsTotal}
              </small>
            )}
          </div>
          <label>
            Plan
            <select
              value={selectedPlanId}
              onChange={(event) => setSelectedPlanId(event.target.value as MembershipPlanId)}
              disabled={updatingSubscription}
            >
              {membershipPlans.filter((plan) => plan.id !== "free").map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} - {plan.credits} credits - {plan.price} {plan.currency}/{plan.billingInterval}
                </option>
              ))}
            </select>
          </label>
          <div className="profile__subscription-actions">
            {canStartMembershipCheckout && (
              <Button
                disabled={updatingSubscription}
                onClick={() => void startMembershipCheckout(selectedPlanId)}
              >
                {updatingSubscription ? "Opening checkout..." : "Continue to payment"}
              </Button>
            )}
            <Button
              disabled={!canUseMembership || updatingCredits}
              onClick={() => void topUpCredits()}
            >
              {updatingCredits ? "Adding..." : "Top up 50 credits"}
            </Button>
            {canManageBilling && (
              <Button
                disabled={updatingSubscription}
                onClick={() => void openBillingPortal()}
              >
                Manage billing
              </Button>
            )}
            {canUseMembership &&
              subscription.planId !== "free" &&
              subscription.stripeSubscriptionId &&
              !subscription.cancelAtPeriodEnd && (
                <Button
                  disabled={updatingSubscription}
                  onClick={() => void cancelAtPeriodEnd()}
                >
                  Cancel at period end
                </Button>
            )}
          </div>
          {subscriptionMessage && <small>{subscriptionMessage}</small>}
          {creditMessage && <small>{creditMessage}</small>}
        </section>
      </div>

      <section className="profile__portfolio">
        <div className="profile__portfolio-header">
          <h2>My collection</h2>
          <div className="profile__portfolio-tools">
            <label className="profile__sort">
              <span>Sort</span>
              <select
                value={portfolioSort}
                onChange={(event) => setPortfolioSort(event.target.value as PortfolioSort)}
              >
                <option value="default">Default</option>
                <option value="price_desc">Price high to low</option>
                <option value="price_asc">Price low to high</option>
              </select>
            </label>
            <div className="profile__estimated-value">
              <div className="profile__estimated-value-row">
                <span>Price source</span>
                <div className="profile__estimated-value-options" aria-label="Estimated value source">
                  <label>
                    <input
                      type="radio"
                      name="estimated-value-source"
                      checked={estimatedValueSource === "tcgplayer"}
                      onChange={() => setEstimatedValueSource("tcgplayer")}
                    />
                    TCGPlayer
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="estimated-value-source"
                      checked={estimatedValueSource === "cardmarket"}
                      onChange={() => setEstimatedValueSource("cardmarket")}
                    />
                    Cardmarket
                  </label>
                </div>
              </div>
              <div className="profile__estimated-value-row">
                <span>Estimated value</span>
                <strong>{estimatedCollectionValueLabel}</strong>
              </div>
              {missingPriceMessage && (
                <small className="profile__missing-price-data">{missingPriceMessage}</small>
              )}
            </div>
          </div>
        </div>

        {portfolio.length === 0 ? (
          <p>No saved cards yet.</p>
        ) : (
          <GridView className="ui-fade ui-fade--slow ui-fade--visible">
            {sortedPortfolio.map((card: PokemonCardType) => (
              <div key={card.id} className="profile__portfolio-card">
                <PokemonCard card={card} priceSource={estimatedValueSource} />
                <div className="profile__card-actions ui-fade">
                  <div className="profile__quantity-control">
                    <button
                      type="button"
                      className="profile__quantity-button"
                      aria-label={`Increase ${card.name} quantity`}
                      disabled={updatingQuantityId === card.id}
                      onClick={() => requestQuantityChange(card, 1)}
                    >
                      <ChevronUp aria-hidden="true" />
                    </button>
                  </div>
                  <div className="profile__quantity-display">
                    <input
                      className="profile__quantity"
                      aria-label={`${card.name} quantity`}
                      type="number"
                      min="1"
                      readOnly
                      value={
                        pendingQuantity?.cardId === card.id
                          ? pendingQuantity.quantity
                          : card.quantity ?? 1
                      }
                    />
                    <div
                      className={`profile__quantity-confirm ui-fade${pendingQuantity?.cardId === card.id ? " ui-fade--visible" : ""}`}
                      role="dialog"
                      aria-label="Confirm quantity change"
                      aria-hidden={pendingQuantity?.cardId !== card.id}
                    >
                        <button
                          type="button"
                          disabled={!pendingQuantity || pendingQuantity.cardId !== card.id || pendingQuantity.quantity === (card.quantity ?? 1)}
                          onClick={confirmQuantityChange}
                        >
                          Update
                        </button>
                        <button type="button" onClick={() => setPendingQuantity(null)}>Cancel</button>
                    </div>
                  </div>
                  <div className="profile__quantity-control">
                    <button
                      type="button"
                      className="profile__quantity-button"
                      aria-label={`Decrease ${card.name} quantity`}
                    disabled={
                      (pendingQuantity?.cardId === card.id
                        ? pendingQuantity.quantity
                        : card.quantity ?? 1) <= 1 || updatingQuantityId === card.id
                    }
                      onClick={() => requestQuantityChange(card, -1)}
                    >
                      <ChevronDown aria-hidden="true" />
                    </button>
                  </div>
                  <div className="profile__remove-control">
                    <button
                      type="button"
                      className="profile__remove-card"
                      aria-label={`Remove ${card.name} from portfolio`}
                      title="Remove from portfolio"
                      onClick={() => setPendingRemoval({ cardId: card.id, cardName: card.name })}
                    >
                      <X aria-hidden="true" />
                    </button>
                    <div
                      className={`profile__quantity-confirm ui-fade${pendingRemoval?.cardId === card.id ? " ui-fade--visible" : ""}`}
                      role="dialog"
                      aria-label="Confirm card removal"
                      aria-hidden={pendingRemoval?.cardId !== card.id}
                    >
                        <span>Remove {pendingRemoval?.cardName ?? card.name}?</span>
                        <button type="button" onClick={confirmRemoval}>OK</button>
                        <button type="button" onClick={() => setPendingRemoval(null)}>Cancel</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </GridView>
        )}
      </section>

      <div className="profile__actions">
        <Button onClick={logout}>Log out</Button>
      </div>
    </div>
  );
}
