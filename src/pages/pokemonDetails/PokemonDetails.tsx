import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BadgeDollarSign, Gem, LineChart, type LucideIcon } from "lucide-react";
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

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type CardInfoField = {
  label: string;
  value: string | number | undefined;
  highlight?: boolean;
};

type ActiveView =
  | "empty_view"
  | "collector_analysis"
  | "search_card"
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
};

const AI_Features: AI_feature[] = [
  {
    view: "prices",
    title: "Markedspriser",
    description: "TCGPlayer og Cardmarket",
    icon: LineChart,
    color: "teal",
    creditFeature: "price_analysis",
  },
  {
    view: "collector_analysis",
    title: "Samlerverdi",
    description: "AI-rangering for samlere",
    icon: Gem,
    color: "yellow",
    creditFeature: "collector_analysis",
  },
  {
    view: "ebay_sold",
    title: "eBay solgte",
    description: "Nylig solgte kort",
    icon: BadgeDollarSign,
    color: "orange",
    creditFeature: "ebay_sold",
  },
  {
    view: "worth_grading",
    title: "Worth grading?",
    description: "See if this card is worth getting PSA graded",
    icon: BadgeDollarSign,
    color: "pink",
    creditFeature: "worth_grading",
  },
];

function getCardSetInfoFields(
  card: PokemonCard,
  cardNumber: string | undefined = card.number
): CardInfoField[] {
  return [
    { label: "Series", value: card.set?.series },
    { label: "Rarity", value: card.rarity ?? "N/A", highlight: true },
    { label: "Kortnummer", value: cardNumber },
    { label: "Printed Total", value: card.set?.printedTotal },
    { label: "Set ID", value: card.set?.id },
    { label: "Release Date", value: card.set?.releaseDate },
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
  const cachedCard = id ? getSelectedPokemonFromCache(id) : null;
  const [card, setCard] = useState<PokemonCard | null>(cachedCard);
  const [loading, setLoading] = useState(!cachedCard && Boolean(id));
  const [cardImageSrc, setCardImageSrc] = useState<string | undefined>(
    cachedCard?.images?.large ?? cachedCard?.images?.small
  );
  const [activeView, setActiveView] = useState<ActiveView>("empty_view");
  const [grokResponse, setGrokResponse] = useState("");
  const [grokError, setGrokError] = useState("");
  const [grokLoading, setGrokLoading] = useState(false);
  const [updatingPortfolio, setUpdatingPortfolio] = useState(false);
  const [justTcgLoading, setJustTcgLoading] = useState(false);
  const [justTcgError, setJustTcgError] = useState("");
  const [justTcgResult, setJustTcgResult] = useState<unknown>(null);
  const [featureCooldown, setFeatureCooldown] = useState(false);
  const {
    abortActiveRequest,
    isCurrentRequest,
    startRequest,
  } = useAbortableRequest();
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

  async function handlePortfolioToggle() {
    if (!card || updatingPortfolio) return;

    setUpdatingPortfolio(true);
    if (isCardSaved(card.id)) {
      await removePokemonFromPortfolio(card.id);
    } else {
      await savePokemonToPortfolio(card);
    }
    setUpdatingPortfolio(false);
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
          verifyJustTcgCard(result, card.name, card.set.name, cardNumber),
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
    )
      .then((result) => {
        if (signal.aborted) return false;
        if (!result.ok) {
          setGrokError(result.error);
          return false;
        }
        setGrokResponse(result.text);
        updateSubscription(result.subscription);
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
    if (featureCooldown || !subscription || creditsRemaining < 1) return;

    setFeatureCooldown(true);
    abortActiveRequest();
    setActiveView(aiFeature.view);

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
      const result = await askGrok(prompt, aiFeature.creditFeature, signal);
      if (signal.aborted) return;

      if (!result.ok) {
        setGrokError(result.error);
      } else {
        setGrokResponse(result.text);
        updateSubscription(result.subscription);
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
  }, [abortActiveRequest, id]);

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
        <p>Loading Pokémon...</p>
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
  const infoFields = getCardSetInfoFields(card, displayedCardNumber);
  const cardIsSaved = isCardSaved(card.id);

  const grokRequest: GrokRequestState = {
    loading: grokLoading,
    error: grokError,
    response: grokResponse,
  };

  // RENDERING
  return (
    <div className="card-view">
      <div className="card-view__panel-wrap">
        <div className="card-view__shell">
          <div className="card-view__image-side">
            <img className="card-view__image" src={cardImageSrc} alt={card.name} />
          </div>

          <div className="card-view__info-side">
            <h2 className="card-view__title">{card.name}</h2>
            {card.set?.name && (
              <p className="card-view__title-set">{card.set.name}</p>
            )}

            <div className="card-view__info-grid">
              {infoFields.map((field) => (
                <div key={field.label} className="card-view__info-item">
                  <span className="card-view__label">{field.label}</span>
                  <span
                    className={`card-view__value${
                      field.highlight ? " card-view__value--highlight" : ""
                    }`}
                  >
                    {field.value ?? "N/A"}
                  </span>
                </div>
              ))}
            </div>

            <div className="card-view__info-actions">
              <Button
                className="card-view__portfolio-button"
                disabled={updatingPortfolio}
                onClick={handlePortfolioToggle}
              >
                <span>
                  {updatingPortfolio
                    ? cardIsSaved ? "Removing..." : "Saving..."
                    : cardIsSaved ? "Remove from portfolio" : "Add to portfolio"}
                </span>
              </Button>
              <Button
                className="card-view__change-card"
                onClick={() => {
                  abortActiveRequest();
                  setActiveView("search_card");
                }}
                aria-pressed={activeView === "search_card"}
              >
                <span>Change card</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="card-view__credit-note">
        <span>1 credit per analyse</span>
        <strong>
          {loadingSubscription
            ? "Laster credits..."
            : subscription
              ? `${creditsRemaining} credits igjen`
              : "Logg inn for å se credits"}
        </strong>
        {creditMessage && <small>{creditMessage}</small>}
      </div>

      <div className="card-view__actions feature-buttons__row">
        {AI_Features.map((aiFeature) => {
          const Icon = aiFeature.icon;

          return (
            <button
              key={aiFeature.view}
              type="button"
              className={`feature-button${activeView === aiFeature.view ? " is-active" : ""}`}
              style={getCustomColors(aiFeature.color)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleFeatureClick(aiFeature)}
              disabled={
                loadingSubscription ||
                updatingCredits ||
                featureCooldown ||
                creditsRemaining < 1
              }
              aria-pressed={activeView === aiFeature.view}
            >
              <span className="feature-button__icon" aria-hidden="true">
                <Icon size={22} strokeWidth={2} />
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

      <section className={`card-view__page${activeView === "prices" ? " card-view__page--prices" : ""}`} aria-live="polite">

        {activeView === "empty_view" && (
          <div className="card-view__empty-view" aria-hidden="true">
            Empty view
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
          cardNumber={displayedCardNumber}
          grokRequest={grokRequest}
          justTcgRequest={{
            loading: justTcgLoading,
            error: justTcgError,
            response: justTcgResult,
          }}
          />
        )}
        {activeView === "search_card" && <DatabaseSearch />}
        {activeView === "worth_grading" && (<WorthGradingView grokRequest={grokRequest} />)}
        {activeView === "collector_analysis" && (
          <CollectorAnalysis card={card} grokRequest={grokRequest} />
        )}
      </section>

    </div>
  );
}
