import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDown,
  BadgeDollarSign,
  CalendarDays,
  Gem,
  Hash,
  Layers3,
  LineChart,
  Palette,
  Search,
  Star,
  Tag,
  type LucideIcon,
} from "lucide-react";
import "./PokemonDetails.scss";
import "../../components/welcomeView/WelcomeView.scss";
import type { PokemonCard } from "../../types/pokemon";
import {
  getSelectedPokemonFromCache,
  setSelectedPokemonCache,
} from "../../utils/selectedPokemonCache";
import { askGrok, type GrokRequestState } from "../../utils/grok/grokClient";
import {
  collectorsAnalysisPrompt,
  isWorthGradingPrompt,
  priceAnalysisPrompt,
  sellMyCardPrompt,
} from "../../utils/grok/grokPrompts";
import Button from "../../components/button/Button";
import { DatabaseSearch } from "../../components/databaseSearch/DatabaseSearch";
import CollectorAnalysis from "./views/CollectorAnalysis/CollectorAnalysisView";
import EbaySoldView from "./views/EbaySold/EbaySoldView";
import {
  getCustomColors,
  type CustomColors,
} from "../../utils/customStylings";
import { WorthGradingView } from "./views/WorthGrading/WorthGradingView";
import { usePokemonPortfolio } from "../../hooks/pokemonPortfolio";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import { PriceAnalysis } from "./views/priceAnalysis/PriceAnalysis";
import { SellPriceView } from "./views/SellPrice/SellPriceView";
import {
  fetchJustTcgCard,
  verifyJustTcgCard,
} from "../../utils/fetchJustTcgCard";
import {
  useCredits,
  useMembershipSubscription,
  type CreditUsageFeature,
} from "../../subscriptions";
import { logClientError } from "../../utils/logClientError";
import {
  isAbortError,
  useAbortableRequest,
} from "../../hooks/useAbortableRequest";
import { waitForStoredResponse } from "../../utils/waitForStoredResponse";
import { CardFeatureHeader } from "./components/CardFeatureHeader";
import { LoadingState } from "../../components/loadingState/LoadingState";
import LoginModal from "../../components/loginmodal/Loginmodal";
import { useAuth } from "../../context/authContextValue";
import { formatCardNumber } from "../../utils/formatCardNumber";
import { fetchCardById } from "../../services/cardApi";

const releaseDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

type CardInfoField = {
  icon: LucideIcon;
  label: string;
  value: string | number | undefined;
  highlight?: boolean;
};

type ActiveView =
  | "empty_view"
  | "collector_analysis"
  | "ebay_sold"
  | "prices"
  | "sell_price"
  | "worth_grading";

type AI_feature = {
  view: Extract<
    ActiveView,
    "prices" | "collector_analysis" | "ebay_sold" | "sell_price" | "worth_grading"
  >;
  title: string;
  description: string;
  icon: LucideIcon;
  color: CustomColors;
  creditFeature: CreditUsageFeature;
  headerLabel: string;
};

const AI_Features: AI_feature[] = [
  {
    view: "prices",
    title: "Markedspriser",
    description: "TCGPlayer og Cardmarket",
    icon: LineChart,
    color: "orange",
    creditFeature: "price_analysis",
    headerLabel: "Market prices",
  },
  {
    view: "collector_analysis",
    title: "Samlerverdi",
    description: "AI-rangering for samlere",
    icon: Gem,
    color: "blue",
    creditFeature: "collector_analysis",
    headerLabel: "Collector analysis",
  },
  {
    view: "ebay_sold",
    title: "eBay solgte",
    description: "Nylig solgte kort",
    icon: BadgeDollarSign,
    color: "teal",
    creditFeature: "ebay_sold",
    headerLabel: "eBay sold listings",
  },
  {
    view: "worth_grading",
    title: "Worth grading?",
    description: "See if this card is worth getting PSA graded",
    icon: BadgeDollarSign,
    color: "pink",
    creditFeature: "worth_grading",
    headerLabel: "Grading analysis",
  },
  {
    view: "sell_price",
    title: "Sell Price",
    description: "Where and what should i sell this card for?",
    icon: BadgeDollarSign,
    color: "yellow",
    creditFeature: "sell_price",
    headerLabel: "Selling recommendation",
  },
];

function formatReleaseDate(value: string | undefined) {
  if (!value) return value;

  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value.trim());
  if (!match) return value;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return value;
  }

  return releaseDateFormatter.format(date);
}

function getCardSetInfoFields(card: PokemonCard): CardInfoField[] {
  return [
    { icon: Layers3, label: "Series", value: card.set?.series },
    {
      icon: Gem,
      label: "Rarity",
      value: card.rarity ?? "N/A",
      highlight: true,
    },
    { icon: Hash, label: "Card number", value: formatCardNumber(card) },
    { icon: Tag, label: "Set size", value: card.set.total },
    { icon: Palette, label: "Artist", value: card.artist },
    {
      icon: CalendarDays,
      label: "Released",
      value: formatReleaseDate(card.set?.releaseDate),
    },
  ];
}

function getJustTcgCardNumber(result: unknown): string | undefined {
  if (!result || typeof result !== "object" || !("data" in result)) return undefined;

  const data = result.data;
  if (!Array.isArray(data) || !data[0] || typeof data[0] !== "object") return undefined;

  const number = "number" in data[0] ? data[0].number : undefined;
  if (typeof number === "string" && number.trim()) return number;
  if (typeof number === "number" && Number.isFinite(number)) return String(number);

  return undefined;
}

function PokemonDetailsForCard() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const cardViewRef = useRef<HTMLDivElement>(null);
  const featureButtonsRef = useRef<HTMLDivElement>(null);
  const changeCardButtonRef = useRef<HTMLButtonElement>(null);
  const portfolioConfirmationTimerRef = useRef<number | undefined>(undefined);
  const cardRequestSequenceRef = useRef(0);
  const routeCardIdRef = useRef(id);
  const [searchResultsHost, setSearchResultsHost] = useState<HTMLDivElement | null>(
    null,
  );
  const cachedCard = useMemo(
    () => (id ? getSelectedPokemonFromCache(id) : null),
    [id],
  );
  const [cardRequestState, setCardRequestState] = useState<{
    card: PokemonCard | null;
    cardId: string | undefined;
    loading: boolean;
  }>(() => ({
    card: cachedCard,
    cardId: id,
    loading: !cachedCard && Boolean(id),
  }));
  const cardStateMatchesRoute = cardRequestState.cardId === id;
  const card = cardStateMatchesRoute ? cardRequestState.card : cachedCard;
  const loading = cardStateMatchesRoute
    ? cardRequestState.loading
    : Boolean(id) && !cachedCard;
  const [cardImageSrc, setCardImageSrc] = useState<string | undefined>(
    cachedCard?.images?.large ?? cachedCard?.images?.small
  );
  const [activeView, setActiveView] = useState<ActiveView>("empty_view");
  const [showCardSearch, setShowCardSearch] = useState(false);
  const [grokResponse, setGrokResponse] = useState("");
  const [grokError, setGrokError] = useState("");
  const [grokLoading, setGrokLoading] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [updatingPortfolio, setUpdatingPortfolio] = useState(false);
  const [portfolioConfirmation, setPortfolioConfirmation] = useState("");
  const [justTcgLoading, setJustTcgLoading] = useState(false);
  const [justTcgError, setJustTcgError] = useState("");
  const [justTcgResult, setJustTcgResult] = useState<unknown>(null);
  const [ebayLoading, setEbayLoading] = useState(false);
  const [featureCooldown, setFeatureCooldown] = useState(false);
  const {
    abortActiveRequest,
    isCurrentRequest,
    startRequest,
  } = useAbortableRequest();
  const { user: authUser } = useAuth();
  const { savePokemonToPortfolio, removePokemonFromPortfolio } = usePokemonPortfolio();
  const {
    isCardSaved,
    loadingPortfolioReferences,
    portfolioReferencesError,
  } = usePortfolioCache();
  const {
    loadingSubscription,
    subscription,
    updateSubscription,
  } = useMembershipSubscription();
  const {
    creditMessage,
    creditsRemaining,
    updatingCredits,
  } = useCredits(subscription);

  useLayoutEffect(() => {
    routeCardIdRef.current = id;
  }, [id]);

  function scrollToFeatureButtons() {
    requestAnimationFrame(() => {
      const changeCardButton = changeCardButtonRef.current;
      if (!changeCardButton) return;

      window.scrollTo({
        top: window.scrollY + changeCardButton.getBoundingClientRect().top - 16,
        behavior: "smooth",
      });
    });
  }

  function showPortfolioConfirmation(message: string) {
    window.clearTimeout(portfolioConfirmationTimerRef.current);
    setPortfolioConfirmation(message);
    portfolioConfirmationTimerRef.current = window.setTimeout(() => {
      setPortfolioConfirmation("");
    }, 1000);
  }

  async function handlePortfolioToggle() {
    if (
      !card ||
      updatingPortfolio ||
      loadingPortfolioReferences ||
      portfolioReferencesError
    ) {
      return;
    }

    if (!authUser) {
      showPortfolioConfirmation("Du må være logget inn for å lagre kort.");
      return;
    }

    const cardWasSaved = isCardSaved(card.id);
    setUpdatingPortfolio(true);
    try {
      const success = cardWasSaved
        ? await removePokemonFromPortfolio(card.id, false)
        : await savePokemonToPortfolio(card);

      if (!success) return;

      showPortfolioConfirmation(
        cardWasSaved ? "Removed from portfolio" : "Added to portfolio"
      );
    } finally {
      setUpdatingPortfolio(false);
    }
  }

  async function handlePriceAnalysis(signal: AbortSignal) {
    if (!card) return false;

    if (!card.number) {
      setJustTcgError("This card has no card number");
      return false;
    }
    const cardNumber = card.number;

    setJustTcgLoading(true);
    setGrokLoading(true);
    setJustTcgError("");
    setGrokError("");
    setGrokResponse("");
    setJustTcgResult(null);

    const justTcgRequest = fetchJustTcgCard(card.name, cardNumber, signal)
      .then((result) => {
        setJustTcgResult(
          verifyJustTcgCard(result, card.set.name, cardNumber),
        );
        return true;
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return false;
        setJustTcgError(
          error instanceof Error ? error.message : "JustTCG request failed",
        );
        return false;
      })
      .finally(() => {
        if (isCurrentRequest(signal)) setJustTcgLoading(false);
      });

    const grokRequest = askGrok(
      priceAnalysisPrompt(card.name, card.set.name, cardNumber),
      "price_analysis",
      signal,
      card.id,
    )
      .then(async (result) => {
        if (signal.aborted) return false;
        if (!result.ok) {
          setGrokError(result.error);
          return false;
        }
        updateSubscription(result.subscription);
        if (result.fromDatabase) {
          await waitForStoredResponse(signal);
        }
        if (signal.aborted) return false;
        setGrokResponse(result.text);
        return true;
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return false;
        setGrokError(error instanceof Error ? error.message : "Price analysis failed");
        return false;
      })
      .finally(() => {
        if (isCurrentRequest(signal)) setGrokLoading(false);
      });

    const [justTcgSucceeded, grokSucceeded] = await Promise.all([
      justTcgRequest,
      grokRequest,
    ]);
    return justTcgSucceeded || grokSucceeded;
  }

  async function handleFeatureClick(aiFeature: AI_feature) {
    if (!card || featureCooldown || !subscription || creditsRemaining < 1) return;

    setFeatureCooldown(true);
    abortActiveRequest();
    setActiveView(aiFeature.view);
    scrollToFeatureButtons();

    // ebay handles in its own component
    if (aiFeature.view === "ebay_sold") {
      return;
    }

    //safety guard, must qualify the features
    if (
      aiFeature.view !== "prices" &&
      aiFeature.view !== "collector_analysis" &&
      aiFeature.view !== "sell_price" &&
      aiFeature.view !== "worth_grading"
    ) {
      return;
    }

    const cardNameAndSet = [card?.name, card?.set?.name].filter(Boolean).join(" ");
    if (aiFeature.view === "prices") {
      await handlePriceAnalysis(startRequest());
      return;
    }

    let prompt = "";

    if (aiFeature.view === "collector_analysis") {
      prompt = collectorsAnalysisPrompt(cardNameAndSet);
    }

    if (aiFeature.view === "worth_grading") {
      prompt = isWorthGradingPrompt(cardNameAndSet);
    }

    if (aiFeature.view === "sell_price") {
      if (!card.number) {
        setGrokError("This card has no card number");
        setGrokResponse("");
        return;
      }
      prompt = sellMyCardPrompt(card.name, card.set.name, card.number);
    }

    setGrokLoading(true);
    setGrokError("");
    setGrokResponse("");

    const signal = startRequest();
    try {
      const result = await askGrok(
        prompt,
        aiFeature.creditFeature,
        signal,
        aiFeature.view === "collector_analysis" || aiFeature.view === "worth_grading"
          ? card.id
          : undefined,
      );
      if (signal.aborted) return;

      if (!result.ok) {
        setGrokError(result.error);
      } else {
        updateSubscription(result.subscription);
        if (
          result.fromDatabase &&
          (aiFeature.view === "collector_analysis" || aiFeature.view === "worth_grading")
        ) {
          await waitForStoredResponse(signal);
        }
        if (signal.aborted) return;
        setGrokResponse(result.text);
      }
    } catch (error) {
      if (!isAbortError(error)) {
        setGrokError(error instanceof Error ? error.message : "Analysis failed");
      }
    } finally {
      if (isCurrentRequest(signal)) setGrokLoading(false);
    }
  }

  useEffect(() => () => {
    window.clearTimeout(portfolioConfirmationTimerRef.current);
  }, []);

  useEffect(() => {
    const requestSequence = ++cardRequestSequenceRef.current;
    if (!id) return;

    const controller = new AbortController();

    fetchCardById(id, controller.signal)
      .then((fetchedCard) => {
        if (
          controller.signal.aborted ||
          cardRequestSequenceRef.current !== requestSequence ||
          routeCardIdRef.current !== id
        ) {
          return;
        }

        setCardRequestState({
          card: fetchedCard,
          cardId: id,
          loading: false,
        });
        try {
          setSelectedPokemonCache(fetchedCard);
        } catch (cacheError) {
          logClientError("Failed to refresh selected card cache", cacheError);
        }
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          cardRequestSequenceRef.current !== requestSequence ||
          routeCardIdRef.current !== id
        ) {
          return;
        }
        logClientError("Failed to load card", error);
        // A background refresh failure must not discard a usable cached card.
        setCardRequestState({
          card: cachedCard,
          cardId: id,
          loading: false,
        });
      });

    return () => {
      cardRequestSequenceRef.current += 1;
      controller.abort();
    };
  }, [cachedCard, id]);

  useEffect(() => {
    const navigationState = location.state as {
      card?: PokemonCard;
      scrollToCardView?: boolean;
    } | null;

    if (
      !navigationState?.scrollToCardView ||
      !card ||
      card.id !== id
    ) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const cardView = cardViewRef.current;
      if (!cardView) return;

      window.scrollTo({
        behavior: "smooth",
        top: window.scrollY + cardView.getBoundingClientRect().top - 50,
      });
      navigate(location.pathname, {
        preventScrollReset: true,
        replace: true,
        state: {
          ...navigationState,
          scrollToCardView: false,
        },
      });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [card, id, location.pathname, location.state, navigate]);

  useEffect(() => {
    let image: HTMLImageElement | null = null;
    const imageTimer = window.setTimeout(() => {
      if (!card) {
        setCardImageSrc(undefined);
        return;
      }

      const smallImage = card.images?.small;
      const largeImage = card.images?.large;

      if (!largeImage || largeImage === smallImage) {
        setCardImageSrc(largeImage ?? smallImage);
        return;
      }

      setCardImageSrc(smallImage ?? largeImage);
      image = new Image();
      image.onload = () => setCardImageSrc(largeImage);
      image.src = largeImage;
    }, 0);

    return () => {
      window.clearTimeout(imageTimer);
      if (image) image.onload = null;
    };
  }, [card]);

  useEffect(() => {
    if (!featureCooldown) return;

    const cooldownTimer = window.setTimeout(() => {
      setFeatureCooldown(false);
    }, 2000);

    return () => window.clearTimeout(cooldownTimer);
  }, [featureCooldown]);

  if (loading) {
    return (
      <div className="card-view card-view--status">
        <LoadingState>Loading Pokémon...</LoadingState>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="card-view card-view--status">
        <p>Couldn't find Pokémon</p>
      </div>
    );
  }

  const displayedCardNumber = getJustTcgCardNumber(justTcgResult) ?? card.number;
  const infoFields = getCardSetInfoFields(card);
  const cardIsSaved = isCardSaved(card.id);
  const portfolioBusy =
    updatingPortfolio ||
    (Boolean(authUser) && loadingPortfolioReferences);
  const portfolioUnavailable =
    Boolean(authUser) && Boolean(portfolioReferencesError);
  const activeFeature = AI_Features.find((feature) => feature.view === activeView);

  const grokRequest: GrokRequestState = {
    loading: grokLoading,
    error: grokError,
    response: grokResponse,
  };

  // RENDERING
  return (
    <div ref={cardViewRef} className="card-view">
      <div className="card-view__panel-wrap">
        <div className="card-view__shell">
          <div className="card-view__details">
            <div className="card-view__image-side">
              <img
                key={card.id}
                className="card-view__image ui-render-fade"
                src={cardImageSrc}
                alt={card.name}
              />
            </div>

            <div className="card-view__info-side">
              <div className="card-view__title-row">
                <h2 className="card-view__title">{card.name}</h2>
                <div className="card-view__portfolio-control">
                  <Button
                    variant="portfolio"
                    disabled={portfolioBusy || portfolioUnavailable}
                    onClick={handlePortfolioToggle}
                    aria-label={
                      portfolioUnavailable
                        ? "Portfolio is unavailable"
                        : updatingPortfolio
                          ? "Updating portfolio"
                          : authUser && loadingPortfolioReferences
                            ? "Checking portfolio"
                            : cardIsSaved
                              ? "Remove from portfolio"
                              : "Add to portfolio"
                    }
                    aria-pressed={cardIsSaved}
                    aria-busy={portfolioBusy}
                    title={
                      portfolioUnavailable
                        ? "Portfolio is unavailable"
                        : updatingPortfolio
                          ? "Updating portfolio"
                          : authUser && loadingPortfolioReferences
                            ? "Checking portfolio"
                            : cardIsSaved
                              ? "Remove from portfolio"
                              : "Add to portfolio"
                    }
                  >
                    {portfolioBusy ? (
                      <span className="app-btn__spinner" aria-hidden="true" />
                    ) : (
                      <>
                        <Star aria-hidden="true" />
                        <span>
                          {portfolioUnavailable
                            ? "Portfolio unavailable"
                            : "Portfolio"}
                        </span>
                      </>
                    )}
                  </Button>
                  {portfolioConfirmation && (
                    <span className="card-view__portfolio-confirmation" role="status">
                      {portfolioConfirmation}
                    </span>
                  )}
                </div>
              </div>
              {card.set?.name && (
                <p className="card-view__title-set">
                  <i aria-hidden="true">•</i>
                  <img src={card.set.images?.symbol} alt={`${card.set.name} symbol`} />
                  {card.set.name}
                </p>
              )}

              <div className="card-view__info-grid">
                {infoFields.map((field) => {
                  const FieldIcon = field.icon;

                  return (
                    <div key={field.label} className="card-view__info-item">
                      <FieldIcon
                        aria-hidden="true"
                        className="card-view__info-icon"
                      />
                      <div className="card-view__info-copy">
                        <span className="card-view__label">{field.label}</span>
                        <span
                          className={`card-view__value${
                            field.highlight ? " card-view__value--highlight" : ""
                          }`}
                        >
                          {field.value ?? "N/A"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="card-view__info-actions">
                <Button
                  ref={changeCardButtonRef}
                  onClick={() => setShowCardSearch((open) => !open)}
                  aria-expanded={showCardSearch}
                >
                  {showCardSearch ? (
                    <>
                      <ArrowDown size={16} strokeWidth={2.25} aria-hidden="true" />
                      <span>Hide</span>
                    </>
                  ) : (
                    <>
                      <Search size={16} strokeWidth={2.25} aria-hidden="true" />
                      <span>Change card</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {showCardSearch && (
            <div className="card-view__search ui-render-fade">
              <DatabaseSearch
                autoFocusName
                embedded
                resultsPortalEl={searchResultsHost}
              />
            </div>
          )}
        </div>

        {showCardSearch && (
          <div
            ref={setSearchResultsHost}
            className="card-view__search-results-host"
          />
        )}
      </div>

      <div className="card-view__credit-note">
        <span className="card-view__credit-cost">
          <strong>1 Credit</strong>
          <span className="card-view__credit-meta">per analysis</span>
        </span>
        <span className="card-view__credit-divider" aria-hidden="true" />
        <span className="card-view__credit-copy">
          {loadingSubscription
            ? (
              <span
                className="card-view__credit-spinner"
                role="status"
                aria-label="Laster credits"
              />
            )
            : subscription
              ? (
                <span className="card-view__credit-balance">
                  {creditsRemaining} Credits left
                </span>
              )
              : (
                <>
                  <Button
                    variant="micro"
                    onClick={() => setShowLoginModal(true)}
                  >
                    Log in
                  </Button>
                  {" or "}
                  <Link className="card-view__credit-link" to="/signup">
                    Sign up
                  </Link>
                  {" for free credits"}
                </>
              )}
        </span>
        {creditMessage && (
          <small className="card-view__credit-message">{creditMessage}</small>
        )}
      </div>

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />

      <div ref={featureButtonsRef} className="card-view__actions feature-buttons__row">
        {AI_Features.map((aiFeature) => {
          const Icon = aiFeature.icon;
          const isFeatureLoading =
            activeView === aiFeature.view &&
            (grokLoading ||
              (aiFeature.view === "prices" && justTcgLoading) ||
              (aiFeature.view === "ebay_sold" && ebayLoading));

          return (
            <button
              key={aiFeature.view}
              type="button"
              className={`feature-button${activeView === aiFeature.view ? " is-active" : ""}${
                isFeatureLoading ? " is-loading" : ""
              }`}
              style={getCustomColors(aiFeature.color)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleFeatureClick(aiFeature)}
              disabled={
                loadingSubscription ||
                updatingCredits ||
                grokLoading ||
                justTcgLoading ||
                ebayLoading ||
                featureCooldown ||
                creditsRemaining < 1
              }
              aria-pressed={activeView === aiFeature.view}
              aria-busy={isFeatureLoading}
            >
              <span className="feature-button__icon" aria-hidden="true">
                {isFeatureLoading ? (
                  <span className="feature-button__spinner" />
                ) : (
                  <Icon size={22} strokeWidth={2} />
                )}
              </span>
              <span className="feature-button__text">
                <span className="feature-button__title">{aiFeature.title}</span>
                <span className="feature-button__description">
                  {aiFeature.description}
                </span>
              </span>
            </button>
          );
        })}
        {/* <PriceHistory cardId={card.id} /> */}
      </div>

      <section
        key={activeView}
        className={`card-view__page ui-render-fade${
          activeView === "prices" ? " card-view__page--prices" : ""
        }`}
        style={activeFeature ? getCustomColors(activeFeature.color) : undefined}
        aria-live="polite"
      >

        {activeFeature && (
          <CardFeatureHeader
            card={card}
            cardNumber={activeView === "prices" ? displayedCardNumber : undefined}
            color={activeFeature.color}
            icon={activeFeature.icon}
            label={activeFeature.headerLabel}
          />
        )}

        {activeView === "empty_view" && (
          <div className="card-view__empty-view" aria-hidden="true">
          </div>
        )}
        {activeView === "ebay_sold" && (
          <EbaySoldView
            card={card}
            onSubscriptionChange={updateSubscription}
            onLoadingChange={setEbayLoading}
          />
        )}
        {activeView === "prices" && (
          <>
            <PriceAnalysis
              card={card}
              grokRequest={grokRequest}
              justTcgRequest={{
                loading: justTcgLoading,
                error: justTcgError,
                response: justTcgResult,
              }}
            />
          </>
        )}
        {activeView === "worth_grading" && <WorthGradingView grokRequest={grokRequest} />}
        {activeView === "sell_price" && <SellPriceView grokRequest={grokRequest} />}
        {activeView === "collector_analysis" && (
          <CollectorAnalysis grokRequest={grokRequest} />
        )}
      </section>

    </div>
  );
}

export default function PokemonDetails() {
  const { id } = useParams();

  // A route-ID change represents a different card. Remounting resets every
  // card-specific analysis/request state and runs all request cleanup before
  // the next card can render.
  return <PokemonDetailsForCard key={id ?? "missing-card"} />;
}
