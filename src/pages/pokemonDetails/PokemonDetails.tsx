import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowUp,
  BadgeDollarSign,
  CalendarDays,
  Coins,
  Gem,
  LineChart,
  Palette,
  Repeat2,
  Search,
  Star,
  type LucideIcon,
  Wallet,
} from "lucide-react";
import "./PokemonDetails.scss";
import "../../components/welcomeView/WelcomeView.scss";
import type { PokemonCard } from "../../types/pokemon";
import {
  getSelectedPokemonFromCache,
  setSelectedPokemonCache,
} from "../../utils/selectedPokemonCache";
import {
  askGrok,
  askMarketPrices,
  type GrokRequestState,
  type IndependentAnalysisResult,
} from "../../utils/grok/grokClient";
import {
  collectorsAnalysisPrompt,
  isWorthGradingPrompt,
  sellMyCardPrompt,
} from "../../utils/grok/grokPrompts";
import Button from "../../components/button/Button";
import { DatabaseSearch } from "../../components/databaseSearch/DatabaseSearch";
import CollectorAnalysis from "./views/CollectorAnalysis/CollectorAnalysisView";
import EbaySoldView from "./views/EbaySold/EbaySoldView";
import { getCustomColors, type CustomColors } from "../../utils/customStylings";
import { WorthGradingView } from "./views/WorthGrading/WorthGradingView";
import { usePokemonPortfolio } from "../../hooks/pokemonPortfolio";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import { PriceAnalysis } from "./views/priceAnalysis/PriceAnalysis";
import { SellPriceView } from "./views/SellPrice/SellPriceView";
import { FEATURE_ERROR_MESSAGE } from "./views/featureError";
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

type DossierFact = {
  label: string;
  value: string | number | undefined;
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
    | "prices"
    | "collector_analysis"
    | "ebay_sold"
    | "sell_price"
    | "worth_grading"
  >;
  title: string;
  description: string;
  icon: LucideIcon;
  color: CustomColors;
  creditFeature: CreditUsageFeature;
  /** Large analysis heading under the feature eyebrow */
  analysisTitle: string;
};

const AI_Features: AI_feature[] = [
  {
    view: "prices",
    title: "Market analysis",
    description: "TCGPlayer, Cardmarket & sales history",
    icon: LineChart,
    color: "orange",
    creditFeature: "price_analysis",
    analysisTitle: "Extended price data",
  },
  {
    view: "collector_analysis",
    title: "Collectors value",
    description: "AI score for long-term collectibility",
    icon: Gem,
    color: "blue",
    creditFeature: "collector_analysis",
    analysisTitle: "Collectibility breakdown",
  },
  {
    view: "ebay_sold",
    title: "eBay sales",
    description: "Recent comps from real sales",
    icon: BadgeDollarSign,
    color: "teal",
    creditFeature: "ebay_sold",
    analysisTitle: "Recent sold listings",
  },
  {
    view: "worth_grading",
    title: "Grading",
    description: "PSA economics for this card",
    icon: BadgeDollarSign,
    color: "pink",
    creditFeature: "worth_grading",
    analysisTitle: "Grading economics",
  },
  {
    view: "sell_price",
    title: "Sell guide",
    description: "Where and what to list for",
    icon: BadgeDollarSign,
    color: "yellow",
    creditFeature: "sell_price",
    analysisTitle: "Selling recommendation",
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

function getDisplaySubtype(card: PokemonCard) {
  return card.subtypes?.find((subtype) =>
    /^(basic|stage\s*\d+|v|vmax|vstar|ex|gx)$/i.test(subtype),
  );
}

function getCardSetInfoFields(card: PokemonCard): CardInfoField[] {
  return [
    { icon: Palette, label: "Artist", value: card.artist },
    {
      icon: CalendarDays,
      label: "Released",
      value: formatReleaseDate(card.set?.releaseDate),
    },
  ];
}

function compactList(values: Array<string | number> | undefined) {
  const cleanValues = values
    ?.map((value) => String(value).trim())
    .filter(Boolean);
  return cleanValues?.length ? cleanValues.join(", ") : undefined;
}

function formatEffects(
  effects: Array<{ type: string; value: string }> | undefined,
) {
  return effects
    ?.map((effect) => [effect.type, effect.value].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");
}

function getDossierFacts(card: PokemonCard): DossierFact[] {
  const weakness = formatEffects(card.weaknesses);
  const resistance = formatEffects(card.resistances);

  return [
    { label: "Type", value: compactList(card.types) },
    { label: "HP", value: card.hp },
    { label: "Evolves from", value: card.evolvesFrom },
    {
      label: "Pokédex",
      value: card.nationalPokedexNumbers?.length
        ? `#${card.nationalPokedexNumbers.join(", #")}`
        : undefined,
    },
    {
      label: "Retreat",
      value:
        card.convertedRetreatCost !== undefined
          ? `${card.convertedRetreatCost} Energy`
          : compactList(card.retreatCost),
    },
    {
      label: "Legality",
      value: card.legalities?.unlimited ?? card.set?.legalities?.unlimited,
    },
    { label: "Weakness", value: weakness },
    { label: "Resistance", value: resistance },
  ].filter((fact) => fact.value !== undefined && fact.value !== "");
}

function getJustTcgCardNumber(result: unknown): string | undefined {
  if (!result || typeof result !== "object" || !("data" in result))
    return undefined;

  const data = result.data;
  if (!Array.isArray(data) || !data[0] || typeof data[0] !== "object")
    return undefined;

  const number = "number" in data[0] ? data[0].number : undefined;
  if (typeof number === "string" && number.trim()) return number;
  if (typeof number === "number" && Number.isFinite(number))
    return String(number);

  return undefined;
}

function PokemonDetailsForCard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cardRequestSequenceRef = useRef(0);
  const routeCardIdRef = useRef(id);
  const [searchResultsHost, setSearchResultsHost] =
    useState<HTMLDivElement | null>(null);
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
    cachedCard?.images?.large ?? cachedCard?.images?.small,
  );
  const [cardImageFailed, setCardImageFailed] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>("prices");
  const [showCardSearch, setShowCardSearch] = useState(false);
  const [grokResponse, setGrokResponse] = useState("");
  const [grokError, setGrokError] = useState("");
  const [grokLoading, setGrokLoading] = useState(false);
  const [marketSalesResponse, setMarketSalesResponse] = useState("");
  const [marketSalesError, setMarketSalesError] = useState("");
  const [marketSalesLoading, setMarketSalesLoading] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [updatingPortfolio, setUpdatingPortfolio] = useState(false);
  const [justTcgLoading, setJustTcgLoading] = useState(false);
  const [justTcgError, setJustTcgError] = useState("");
  const [justTcgResult, setJustTcgResult] = useState<unknown>(null);
  const [ebayLoading, setEbayLoading] = useState(false);
  const [featureCooldown, setFeatureCooldown] = useState(false);
  const { abortActiveRequest, isCurrentRequest, startRequest } =
    useAbortableRequest();
  const { user: authUser } = useAuth();
  const { savePokemonToPortfolio, removePokemonFromPortfolio } =
    usePokemonPortfolio();
  const { isCardSaved, loadingPortfolioReferences, portfolioReferencesError } =
    usePortfolioCache();
  const { loadingSubscription, subscription, updateSubscription } =
    useMembershipSubscription();
  const { creditMessage, creditsRemaining, updatingCredits } =
    useCredits(subscription);

  useLayoutEffect(() => {
    routeCardIdRef.current = id;
  }, [id]);

  useEffect(() => {
    setCardImageFailed(false);
  }, [cardImageSrc]);

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
      setShowLoginModal(true);
      return;
    }

    const cardWasSaved = isCardSaved(card.id);
    setUpdatingPortfolio(true);
    try {
      const success = cardWasSaved
        ? await removePokemonFromPortfolio(card.id, false)
        : await savePokemonToPortfolio(card);

      if (!success) return;
    } finally {
      setUpdatingPortfolio(false);
    }
  }

  async function handlePriceAnalysis(signal: AbortSignal) {
    if (!card) return false;

    if (!card.number) {
      setJustTcgError(FEATURE_ERROR_MESSAGE);
      return false;
    }
    const cardNumber = card.number;

    setJustTcgLoading(true);
    setGrokLoading(true);
    setMarketSalesLoading(true);
    setJustTcgError("");
    setGrokError("");
    setMarketSalesError("");
    setGrokResponse("");
    setMarketSalesResponse("");
    setJustTcgResult(null);

    const justTcgRequest = fetchJustTcgCard(card.name, cardNumber, signal)
      .then((result) => {
        setJustTcgResult(verifyJustTcgCard(result, card.set.name, cardNumber));
        return true;
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return false;
        setJustTcgError(FEATURE_ERROR_MESSAGE);
        return false;
      })
      .finally(() => {
        if (isCurrentRequest(signal)) setJustTcgLoading(false);
      });

    async function applyAnalysisResult(
      result: IndependentAnalysisResult,
      setResponse: (value: string) => void,
      setError: (value: string) => void,
    ) {
      if (!result.ok) {
        setError(FEATURE_ERROR_MESSAGE);
        return false;
      }
      if (result.fromDatabase) {
        await waitForStoredResponse(signal);
      }
      if (signal.aborted) return false;
      setResponse(result.text);
      return true;
    }

    const grokRequest = askMarketPrices(card.id, signal)
      .then(async (result) => {
        if (signal.aborted) return false;
        if (!result.ok) {
          setGrokError(FEATURE_ERROR_MESSAGE);
          setMarketSalesError(FEATURE_ERROR_MESSAGE);
          return false;
        }
        updateSubscription(result.subscription);
        const [priceSucceeded, salesSucceeded] = await Promise.all([
          applyAnalysisResult(
            result.priceAnalysis,
            setGrokResponse,
            setGrokError,
          ),
          applyAnalysisResult(
            result.salesData,
            setMarketSalesResponse,
            setMarketSalesError,
          ),
        ]);
        return priceSucceeded || salesSucceeded;
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return false;
        setGrokError(FEATURE_ERROR_MESSAGE);
        setMarketSalesError(FEATURE_ERROR_MESSAGE);
        return false;
      })
      .finally(() => {
        if (isCurrentRequest(signal)) {
          setGrokLoading(false);
          setMarketSalesLoading(false);
        }
      });

    const [justTcgSucceeded, grokSucceeded] = await Promise.all([
      justTcgRequest,
      grokRequest,
    ]);
    return justTcgSucceeded || grokSucceeded;
  }

  async function handleFeatureClick(aiFeature: AI_feature) {
    abortActiveRequest();
    setActiveView(aiFeature.view);

    if (aiFeature.view === "prices") {
      setGrokResponse("");
      setGrokError("");
      setGrokLoading(false);
      setJustTcgResult(null);
      setJustTcgError("");
      setJustTcgLoading(false);
      setMarketSalesResponse("");
      setMarketSalesError("");
      setMarketSalesLoading(false);
      return;
    }

    if (!card || featureCooldown || !subscription || creditsRemaining < 1)
      return;

    setFeatureCooldown(true);

    // ebay handles in its own component
    if (aiFeature.view === "ebay_sold") {
      return;
    }

    //safety guard, must qualify the features
    if (
      aiFeature.view !== "collector_analysis" &&
      aiFeature.view !== "sell_price" &&
      aiFeature.view !== "worth_grading"
    ) {
      return;
    }

    const cardNameAndSet = [card?.name, card?.set?.name]
      .filter(Boolean)
      .join(" ");
    let prompt = "";

    if (aiFeature.view === "collector_analysis") {
      prompt = collectorsAnalysisPrompt(cardNameAndSet);
    }

    if (aiFeature.view === "worth_grading") {
      prompt = isWorthGradingPrompt(cardNameAndSet);
    }

    if (aiFeature.view === "sell_price") {
      if (!card.number) {
        setGrokError(FEATURE_ERROR_MESSAGE);
        setGrokResponse("");
        return;
      }
      prompt = sellMyCardPrompt(card.name, card.set.name, card.number);
    }

    setGrokLoading(true);
    setGrokError("");
    setGrokResponse("");

    const usesStoredCardResponse =
      aiFeature.view === "collector_analysis" ||
      aiFeature.view === "worth_grading" ||
      aiFeature.view === "sell_price";
    const signal = startRequest();
    try {
      const result = await askGrok(
        prompt,
        aiFeature.creditFeature,
        signal,
        usesStoredCardResponse ? card.id : undefined,
      );
      if (signal.aborted) return;

      if (!result.ok) {
        setGrokError(FEATURE_ERROR_MESSAGE);
      } else {
        updateSubscription(result.subscription);
        if (result.fromDatabase && usesStoredCardResponse) {
          await waitForStoredResponse(signal);
        }
        if (signal.aborted) return;
        setGrokResponse(result.text);
      }
    } catch (error) {
      if (!isAbortError(error)) {
        setGrokError(FEATURE_ERROR_MESSAGE);
      }
    } finally {
      if (isCurrentRequest(signal)) setGrokLoading(false);
    }
  }

  async function handleGenerateMarketAnalysis() {
    if (!card || featureCooldown || !subscription || creditsRemaining < 1)
      return;

    setFeatureCooldown(true);
    abortActiveRequest();
    setActiveView("prices");
    await handlePriceAnalysis(startRequest());
  }

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
    }, 1000);

    return () => window.clearTimeout(cooldownTimer);
  }, [featureCooldown]);

  if (loading) {
    return (
      <div className="card-view card-view--status ui-render-fade">
        <LoadingState>Loading Pokémon...</LoadingState>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="card-view card-view--status ui-render-fade">
        <p>Couldn't find Pokémon</p>
      </div>
    );
  }

  const displayedCardNumber =
    getJustTcgCardNumber(justTcgResult) ?? card.number;
  const formattedDisplayedCardNumber = formatCardNumber(
    card,
    displayedCardNumber,
  );
  const infoFields = getCardSetInfoFields(card);
  const dossierFacts = getDossierFacts(card);
  const displaySubtype = getDisplaySubtype(card);
  const getFactValue = (label: string) =>
    dossierFacts.find((fact) => fact.label === label)?.value;
  const detailSections = [
    {
      title: "Gameplay",
      items: [
        { label: "Type", value: getFactValue("Type") },
        { label: "HP", value: getFactValue("HP") },
        { label: "Weakness", value: getFactValue("Weakness") },
        { label: "Retreat", value: getFactValue("Retreat") },
        { label: "Resistance", value: getFactValue("Resistance") },
      ],
    },
    {
      title: "Details",
      items: [
        { label: "Stage", value: displaySubtype },
        { label: "Pokédex", value: getFactValue("Pokédex") },
        { label: "Evolves from", value: getFactValue("Evolves from") },
        { label: "Legality", value: getFactValue("Legality") },
      ],
    },
  ]
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => item.value !== undefined && item.value !== "",
      ),
    }))
    .filter((section) => section.items.length > 0);
  const cardIsSaved = isCardSaved(card.id);
  const portfolioBusy =
    updatingPortfolio || (Boolean(authUser) && loadingPortfolioReferences);
  const portfolioUnavailable =
    Boolean(authUser) && Boolean(portfolioReferencesError);
  const activeFeature = AI_Features.find(
    (feature) => feature.view === activeView,
  );
  const grokRequest: GrokRequestState = {
    loading: grokLoading,
    error: grokError,
    response: grokResponse,
  };

  // RENDERING
  return (
    <div className="card-view ui-render-fade">
      <div className="card-view__panel-wrap">
        <div className="card-view__shell">
          <div className="card-view__details">
            <div className="card-view__image-side">
              {cardImageSrc && !cardImageFailed ? (
                <img
                  key={card.id}
                  className="card-view__image ui-render-fade"
                  src={cardImageSrc}
                  alt={card.name}
                  onError={() => setCardImageFailed(true)}
                />
              ) : (
                <div className="card-view__image-placeholder" role="img">
                  <Search aria-hidden="true" />
                  <span>Card image unavailable</span>
                </div>
              )}
              <div className="card-view__image-actions">
                <div className="card-view__change-card">
                  <Button
                    fill="ghost"
                    fullWidth
                    style={getCustomColors("blue")}
                    onClick={() => setShowCardSearch((open) => !open)}
                    aria-expanded={showCardSearch}
                  >
                    {showCardSearch ? (
                      <>
                        <ArrowUp
                          size={16}
                          strokeWidth={2.25}
                          aria-hidden="true"
                        />
                        <span>Close</span>
                      </>
                    ) : (
                      <>
                        <Repeat2
                          size={16}
                          strokeWidth={2.25}
                          aria-hidden="true"
                        />
                        <span>Switch card</span>
                      </>
                    )}
                  </Button>
                </div>
                <div className="card-view__portfolio-control">
                  <Button
                    variant="portfolio"
                    fullWidth
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
                            ? "Unavailable"
                            : cardIsSaved
                              ? "In portfolio"
                              : "Add to portfolio"}
                        </span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="card-view__info-side">
              <div className="card-view__identity">
                <div className="card-view__identity-top">
                  <div className="card-view__title-row">
                    <div
                      className="card-view__title-copy"
                      data-card-number={formattedDisplayedCardNumber}
                    >
                      {formattedDisplayedCardNumber && (
                        <span className="card-view__title-number-accessible">
                          Card number {formattedDisplayedCardNumber}
                        </span>
                      )}
                      <h2 className="card-view__title">{card.name}</h2>
                      {card.set?.name && (
                        <p className="card-view__title-set">
                          {card.set.images?.symbol && (
                            <img
                              src={card.set.images.symbol}
                              alt={`${card.set.name} symbol`}
                            />
                          )}
                          <span>{card.set.name}</span>
                          {card.set?.series && (
                            <>
                              <i aria-hidden="true">•</i>
                              <span>{card.set.series}</span>
                            </>
                          )}
                        </p>
                      )}
                      {(card.rarity || displaySubtype) && (
                        <div className="card-view__title-badges">
                          {card.rarity && (
                            <span className="card-view__title-badge--rarity">
                              {card.rarity}
                            </span>
                          )}
                          {displaySubtype && <span>{displaySubtype}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <section
                  className="card-view__info-section"
                  aria-label="Card credits"
                >
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
                            <span className="card-view__label">
                              {field.label}
                            </span>
                            <span
                              className={`card-view__value${
                                field.highlight
                                  ? " card-view__value--highlight"
                                  : ""
                              }`}
                            >
                              {field.value ?? "N/A"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
                {(card.flavorText || detailSections.length > 0) && (
                  <div className="card-view__lower-sections">
                    {card.flavorText && (
                      <section
                        className="card-view__info-section card-view__info-section--flavor"
                        aria-label="Flavor text"
                      >
                        <p className="card-view__flavor-text">
                          {card.flavorText}
                        </p>
                      </section>
                    )}

                    {detailSections.length > 0 && (
                      <aside
                        className="card-view__detail-panel"
                        aria-label="Card details"
                      >
                        {detailSections.map((section) => (
                          <section
                            className="card-view__detail-section"
                            key={section.title}
                          >
                            <h3>{section.title}</h3>
                            <dl>
                              {section.items.map((item) => (
                                <div key={item.label}>
                                  <dt>{item.label}</dt>
                                  <dd>{item.value}</dd>
                                </div>
                              ))}
                            </dl>
                          </section>
                        ))}
                      </aside>
                    )}
                  </div>
                )}
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

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />

      <div className="card-view__credit-bar">
        <div
          className={`card-view__credit-note${
            !subscription && !loadingSubscription
              ? " card-view__credit-note--auth"
              : ""
          }`}
        >
          <span className="card-view__credit-cost">
            <Coins aria-hidden="true" />
            <strong>1 Credit</strong>
            <span className="card-view__credit-meta">per analysis</span>
          </span>
          <span className="card-view__credit-divider" aria-hidden="true" />
          <span className="card-view__credit-copy">
            {loadingSubscription ? (
              <span
                className="card-view__credit-spinner"
                role="status"
                aria-label="Laster credits"
              />
            ) : subscription ? (
              <span className="card-view__credit-balance">
                <Wallet aria-hidden="true" />
                {creditsRemaining} Credits
              </span>
            ) : (
              <>
                <Button variant="micro" onClick={() => setShowLoginModal(true)}>
                  Log in
                </Button>
                <span className="card-view__credit-auth-muted">or</span>
                <Link className="card-view__credit-link" to="/signup">
                  Sign up
                </Link>
                <span className="card-view__credit-auth-muted">
                  for free credits
                </span>
              </>
            )}
          </span>
          {creditMessage && (
            <small className="card-view__credit-message">{creditMessage}</small>
          )}
        </div>
      </div>

      <section className="card-view__analysis-panel">
        <div className="card-view__actions feature-buttons__row">
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
                  marketSalesLoading ||
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
                  <span className="feature-button__title">
                    {aiFeature.title}
                  </span>
                  <span className="feature-button__description">
                    {aiFeature.description}
                  </span>
                </span>
              </button>
            );
          })}
          {/* <PriceHistory cardId={card.id} /> */}
        </div>

        <div
          className={`card-view__page${
            activeView === "prices" ? " card-view__page--prices" : ""
          }${activeView === "ebay_sold" ? " card-view__page--ebay" : ""}`}
          aria-live="polite"
        >
          {activeFeature && activeView !== "empty_view" && (
            <div
              key={activeView}
              className="card-view__active-feature ui-render-fade"
              style={getCustomColors(activeFeature.color)}
            >
              <div className="card-view__active-body">
                {activeView === "ebay_sold" && (
                  <EbaySoldView
                    card={card}
                    onSubscriptionChange={updateSubscription}
                    onLoadingChange={setEbayLoading}
                  />
                )}
                {activeView === "prices" && (
                  <PriceAnalysis
                    card={card}
                    grokRequest={grokRequest}
                    onGenerateReport={() => void handleGenerateMarketAnalysis()}
                    reportLoading={
                      grokLoading || justTcgLoading || marketSalesLoading
                    }
                    reportAvailable={Boolean(
                      grokResponse || justTcgResult || marketSalesResponse,
                    )}
                    reportDisabled={
                      featureCooldown ||
                      !subscription ||
                      creditsRemaining < 1 ||
                      grokLoading ||
                      justTcgLoading ||
                      marketSalesLoading
                    }
                    salesDataRequest={{
                      loading: marketSalesLoading,
                      error: marketSalesError,
                      response: marketSalesResponse,
                    }}
                    justTcgRequest={{
                      loading: justTcgLoading,
                      error: justTcgError,
                      response: justTcgResult,
                    }}
                  />
                )}
                {activeView === "worth_grading" && (
                  <WorthGradingView grokRequest={grokRequest} />
                )}
                {activeView === "sell_price" && (
                  <SellPriceView grokRequest={grokRequest} />
                )}
                {activeView === "collector_analysis" && (
                  <CollectorAnalysis grokRequest={grokRequest} />
                )}
              </div>
            </div>
          )}

          {activeView === "empty_view" && (
            <div className="card-view__empty-view" aria-hidden="true"></div>
          )}
        </div>
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
