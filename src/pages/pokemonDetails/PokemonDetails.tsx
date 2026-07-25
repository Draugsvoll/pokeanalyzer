import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDown,
  BadgeDollarSign,
  Gem,
  LineChart,
  Search,
  Star,
  type LucideIcon,
} from "lucide-react";
import "./PokemonDetails.scss";
import "./components/CardRarityBadge.scss";
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

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const releaseDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

type CardInfoField = {
  label: string;
  value: string | number | undefined;
  highlight?: boolean;
};

type ActiveView =
  | "empty_view"
  | "collector_analysis"
  | "ebay_sold"
  | "prices"
  | "worth_grading";

type AI_feature = {
  view: Extract<ActiveView, "prices" | "collector_analysis" | "ebay_sold" | "worth_grading">;
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
    { label: "Series", value: card.set?.series },
    { label: "Rarity", value: card.rarity ?? "N/A", highlight: true },
    { label: "Kortnummer", value: formatCardNumber(card) },
    { label: "Set Total Cards", value: card.set.total },
    { label: "Artist", value: card.artist },
    { label: "Release Date", value: formatReleaseDate(card.set?.releaseDate) },
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

export default function PokemonDetails() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const cardViewRef = useRef<HTMLDivElement>(null);
  const featureButtonsRef = useRef<HTMLDivElement>(null);
  const changeCardButtonRef = useRef<HTMLButtonElement>(null);
  const portfolioConfirmationTimerRef = useRef<number | undefined>(undefined);
  const [searchResultsHost, setSearchResultsHost] = useState<HTMLDivElement | null>(
    null,
  );
  const cachedCard = id ? getSelectedPokemonFromCache(id) : null;
  const [card, setCard] = useState<PokemonCard | null>(cachedCard);
  const [loading, setLoading] = useState(!cachedCard && Boolean(id));
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
  const [featureCooldown, setFeatureCooldown] = useState(false);
  const {
    abortActiveRequest,
    isCurrentRequest,
    startRequest,
  } = useAbortableRequest();
  const { user: authUser } = useAuth();
  const { savePokemonToPortfolio, removePokemonFromPortfolio } = usePokemonPortfolio();
  const { isCardSaved } = usePortfolioCache();
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
    if (!card || updatingPortfolio) return;

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

    if (aiFeature.view === "ebay_sold") {
      return;
    }

    if (
      aiFeature.view !== "prices" &&
      aiFeature.view !== "collector_analysis" &&
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

  useEffect(() => {
    abortActiveRequest();
    // New card (e.g. from in-page database search): leave feature panels
    setActiveView("empty_view");
    setShowCardSearch(false);
    setGrokResponse("");
    setGrokError("");
    setGrokLoading(false);
    setJustTcgResult(null);
    setJustTcgError("");
    setJustTcgLoading(false);
  }, [abortActiveRequest, id]);

  useEffect(() => () => {
    window.clearTimeout(portfolioConfirmationTimerRef.current);
  }, []);

  useEffect(() => {
    async function loadCard() {
      if (!id) {
        setCard(null);
        setLoading(false);
        return;
      }

      const cachedCard = getSelectedPokemonFromCache(id);
      if (cachedCard) {
        setCard(cachedCard);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const res = await fetch(`${API_URL}/api/cards/${id}`);

        if (!res.ok) {
          setCard(null);
          return;
        }

        const fetchedCard = (await res.json()) as PokemonCard;

        setSelectedPokemonCache(fetchedCard);
        setCard(fetchedCard);
      } catch (error) {
        logClientError("Failed to load card", error);
        setCard(null);
      } finally {
        setLoading(false);
      }
    }

    loadCard();
  }, [id]);

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
                    disabled={updatingPortfolio}
                    onClick={handlePortfolioToggle}
                    aria-label={cardIsSaved ? "Remove from portfolio" : "Add to portfolio"}
                    aria-pressed={cardIsSaved}
                    aria-busy={updatingPortfolio}
                    title={cardIsSaved ? "Remove from portfolio" : "Add to portfolio"}
                  >
                    <Star aria-hidden="true" />
                    <span>
                      {updatingPortfolio
                        ? "Updating..."
                        : cardIsSaved
                          ? "In portfolio"
                          : "Add to portfolio"}
                    </span>
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
                  {card.set.name}
                </p>
              )}

              <div className="card-view__info-grid">
                {infoFields.map((field) => (
                  <div key={field.label} className="card-view__info-item">
                    <span className="card-view__label">{field.label}</span>
                    <span
                      className={`card-view__value${
                        field.highlight ? " card-rarity-badge" : ""
                      }`}
                    >
                      {field.value ?? "N/A"}
                    </span>
                  </div>
                ))}
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
          <span className="card-view__credit-meta">per analyse</span>
        </span>
        <span className="card-view__credit-divider" aria-hidden="true" />
        <span className="card-view__credit-copy">
          {loadingSubscription
            ? "Laster credits..."
            : subscription
              ? (
                <span className="card-view__credit-balance">
                  {creditsRemaining} Credits left
                </span>
              )
              : (
                <>
                  <button
                    type="button"
                    className="card-view__credit-link"
                    onClick={() => setShowLoginModal(true)}
                  >
                    Login
                  </button>
                  {" or "}
                  <Link className="card-view__credit-link" to="/signup">
                    Sign Up
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
              (aiFeature.view === "prices" && justTcgLoading));

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
          />
        )}
        {activeView === "prices" && (
          <PriceAnalysis
          card={card}
          grokRequest={grokRequest}
          justTcgRequest={{
            loading: justTcgLoading,
            error: justTcgError,
            response: justTcgResult,
          }}
          />
        )}
        {activeView === "worth_grading" && <WorthGradingView grokRequest={grokRequest} />}
        {activeView === "collector_analysis" && (
          <CollectorAnalysis grokRequest={grokRequest} />
        )}
      </section>

    </div>
  );
}
