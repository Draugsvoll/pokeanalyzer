import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  ScanSearch,
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
import Button from "../../components/button/Button";
import { Badge } from "../../components/ui/Badge";
import { DatabaseSearch } from "../../components/databaseSearch/DatabaseSearch";
import { GoogleLoginButton } from "../../components/googleLoginButton/GoogleLoginButton";
import CollectorAnalysis from "./views/CollectorAnalysis/CollectorAnalysisView";
import EbaySoldView from "./views/EbaySold/EbaySoldView";
import { getCustomColors, type CustomColors } from "../../utils/customStylings";
import { WorthGradingView } from "./views/WorthGrading/WorthGradingView";
import { usePokemonPortfolio } from "../../hooks/pokemonPortfolio";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import { PriceAnalysis } from "./views/priceAnalysis/PriceAnalysis";
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
import {
  CardFeatureHeader,
  CARD_FEATURE_HEADER_ACTION_LABEL,
} from "./components/CardFeatureHeader";
import { LoadingState } from "../../components/loadingState/LoadingState";
import LoginModal from "../../components/loginmodal/Loginmodal";
import { signInWithGoogle } from "../../services/auth";
import { useAuth } from "../../context/authContextValue";
import { formatCardNumber } from "../../../shared/formatCardNumber";
import { fetchCardById } from "../../services/cardApi";
import { getRarityBadgeAccent } from "../../utils/pokemonRarity";

const releaseDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});
const EMBEDDED_SEARCH_SCROLL_OFFSET = 80;

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
  | "worth_grading";

type FeatureView = Exclude<ActiveView, "empty_view">;
type StoredGrokFeature = "collector_analysis" | "worth_grading";

type AiFeature = {
  view: FeatureView;
  title: string;
  description: string;
  icon: LucideIcon;
  color: CustomColors;
  featureKey: CreditUsageFeature;
  onOpen: () => Promise<void>;
  actionCostLabel?: string;
};

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
  const [failedCardImageSrc, setFailedCardImageSrc] = useState<string | null>(
    null,
  );
  const [activeView, setActiveView] = useState<ActiveView>("prices");
  const [showCardSearch, setShowCardSearch] = useState(false);
  const [grokResponses, setGrokResponses] = useState<
    Partial<Record<CreditUsageFeature, string>>
  >({});
  const [grokErrors, setGrokErrors] = useState<
    Partial<Record<CreditUsageFeature, string>>
  >({});
  const [grokLoading, setGrokLoading] = useState(false);
  const [marketSalesResponse, setMarketSalesResponse] = useState("");
  const [marketSalesResponseCardId, setMarketSalesResponseCardId] = useState<
    string | null
  >(null);
  const [marketSalesError, setMarketSalesError] = useState("");
  const [marketSalesLoading, setMarketSalesLoading] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [googleAuthLoading, setGoogleAuthLoading] = useState(false);
  const [updatingPortfolio, setUpdatingPortfolio] = useState(false);
  const [justTcgLoading, setJustTcgLoading] = useState(false);
  const [justTcgError, setJustTcgError] = useState("");
  const [justTcgResult, setJustTcgResult] = useState<unknown>(null);
  const [justTcgResultCardId, setJustTcgResultCardId] = useState<string | null>(
    null,
  );
  const [ebayLoading, setEbayLoading] = useState(false);
  const [ebayRunToken, setEbayRunToken] = useState(0);
  const [ebayRunCardId, setEbayRunCardId] = useState<string | null>(null);
  const [ebayReportAvailable, setEbayReportAvailable] = useState(false);
  const [ebayReportCardId, setEbayReportCardId] = useState<string | null>(null);
  const [featureCooldown, setFeatureCooldown] = useState(false);
  const { isCurrentRequest, startRequest } = useAbortableRequest();
  const { user: authUser, loading: authLoading } = useAuth();
  const { savePokemonToPortfolio, removePokemonFromPortfolio } =
    usePokemonPortfolio();
  const { isCardSaved, loadingPortfolioReferences, portfolioReferencesError } =
    usePortfolioCache();

  function updateGrokResponse(featureKey: CreditUsageFeature, value: string) {
    setGrokResponses((current) => ({ ...current, [featureKey]: value }));
  }

  function updateGrokError(featureKey: CreditUsageFeature, value: string) {
    setGrokErrors((current) => ({ ...current, [featureKey]: value }));
  }

  function scrollForEmbeddedSearch() {
    if (window.scrollY > 0) return;

    window.scrollBy({
      behavior: "smooth",
      left: 0,
      top: EMBEDDED_SEARCH_SCROLL_OFFSET,
    });
  }

  function openEmbeddedSearch() {
    scrollForEmbeddedSearch();
    setShowCardSearch(true);
  }

  function handleEmbeddedSearchToggle() {
    if (showCardSearch) {
      setShowCardSearch(false);
      return;
    }

    openEmbeddedSearch();
  }
  const {
    loadingSubscription,
    subscription,
    updateSubscription,
  } = useMembershipSubscription();
  const { creditMessage, creditsRemaining, updatingCredits } =
    useCredits(subscription);

  async function handleGoogleAuth() {
    if (googleAuthLoading) return;

    setGoogleAuthLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      logClientError("Google sign-in failed", error);
    } finally {
      setGoogleAuthLoading(false);
    }
  }

  useLayoutEffect(() => {
    routeCardIdRef.current = id;
  }, [id]);

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
    updateGrokError("price_analysis", "");
    setMarketSalesError("");
    updateGrokResponse("price_analysis", "");
    setMarketSalesResponseCardId(card.id);
    setMarketSalesResponse("");
    setJustTcgResultCardId(null);
    setJustTcgResult(null);

    const justTcgRequest = fetchJustTcgCard(card.name, cardNumber, signal)
      .then((result) => {
        setJustTcgResult(verifyJustTcgCard(result, card.set.name, cardNumber));
        setJustTcgResultCardId(card.id);
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
          updateGrokError("price_analysis", FEATURE_ERROR_MESSAGE);
          setMarketSalesError(FEATURE_ERROR_MESSAGE);
          return false;
        }
        updateSubscription(result.subscription);
        const [priceSucceeded, salesSucceeded] = await Promise.all([
          applyAnalysisResult(
            result.priceAnalysis,
            (value) => updateGrokResponse("price_analysis", value),
            (value) => updateGrokError("price_analysis", value),
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
        updateGrokError("price_analysis", FEATURE_ERROR_MESSAGE);
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

  async function runPaidFeatureAction(
    view: FeatureView,
    action: () => void | Promise<void>,
  ) {
    if (
      !authUser ||
      !card ||
      featureCooldown ||
      !subscription ||
      creditsRemaining < 1
    )
      return;

    setFeatureCooldown(true);
    setActiveView(view);
    await action();
  }

  async function requestStoredGrokAnalysis(featureKey: StoredGrokFeature) {
    if (!card) return;

    setGrokLoading(true);
    updateGrokError(featureKey, "");
    updateGrokResponse(featureKey, "");

    const signal = startRequest();
    try {
      const result = await askGrok(featureKey, {
        signal,
        cardId: card.id,
      });
      if (signal.aborted) return;

      if (!result.ok) {
        updateGrokError(featureKey, FEATURE_ERROR_MESSAGE);
      } else {
        updateSubscription(result.subscription);
        if (result.fromDatabase) {
          await waitForStoredResponse(signal);
        }
        if (signal.aborted) return;
        updateGrokResponse(featureKey, result.text);
      }
    } catch (error) {
      if (!isAbortError(error)) {
        updateGrokError(featureKey, FEATURE_ERROR_MESSAGE);
      }
    } finally {
      if (isCurrentRequest(signal)) setGrokLoading(false);
    }
  }

  async function openMarketAnalysis() {
    await runPaidFeatureAction("prices", async () => {
      await handlePriceAnalysis(startRequest());
    });
  }

  async function openCollectorAnalysis() {
    await runPaidFeatureAction("collector_analysis", () =>
      requestStoredGrokAnalysis("collector_analysis"),
    );
  }

  async function openEbayAnalysis() {
    await runPaidFeatureAction("ebay_sold", () => {
      if (!card) return;

      setEbayRunCardId(card.id);
      setEbayReportAvailable(false);
      setEbayReportCardId(null);
      setEbayRunToken((current) => current + 1);
    });
  }

  async function openWorthGradingAnalysis() {
    await runPaidFeatureAction("worth_grading", () =>
      requestStoredGrokAnalysis("worth_grading"),
    );
  }

  const aiFeatures: AiFeature[] = [
    {
      view: "prices",
      title: "Market Analysis",
      description: "TCGPlayer, Cardmarket & sales history",
      icon: LineChart,
      color: "orange",
      featureKey: "price_analysis",
      onOpen: openMarketAnalysis,
    },
    {
      view: "collector_analysis",
      title: "Collector's Value",
      description: "AI score for long-term collectibility",
      icon: Gem,
      color: "blue",
      featureKey: "collector_analysis",
      onOpen: openCollectorAnalysis,
    },
    {
      view: "ebay_sold",
      title: "eBay Comps",
      description: "Recent comps from real sales",
      icon: BadgeDollarSign,
      color: "teal",
      featureKey: "ebay_sold",
      onOpen: openEbayAnalysis,
    },
    {
      view: "worth_grading",
      title: "Grading",
      description: "PSA economics for this card",
      icon: ScanSearch,
      color: "pink",
      featureKey: "worth_grading",
      onOpen: openWorthGradingAnalysis,
      actionCostLabel: "(2 credits)",
    },
  ];

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

  const activeCardId = card?.id ?? null;
  const handleEbayReportAvailableChange = useCallback(
    (available: boolean) => {
      setEbayReportAvailable(available);
      setEbayReportCardId(available ? activeCardId : null);
    },
    [activeCardId],
  );

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
  const displayRarity = card.rarity?.trim() || "N/A";
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
  const activeFeature = aiFeatures.find(
    (feature) => feature.view === activeView,
  );
  const currentGrokResponse = activeFeature
    ? (grokResponses[activeFeature.featureKey] ?? "")
    : "";
  const currentGrokError = activeFeature
    ? (grokErrors[activeFeature.featureKey] ?? "")
    : "";
  const currentMarketSalesResponse =
    marketSalesResponseCardId === card.id ? marketSalesResponse : "";
  const currentJustTcgResult =
    justTcgResultCardId === card.id ? justTcgResult : null;
  const currentEbayRunToken = ebayRunCardId === card.id ? ebayRunToken : 0;
  const currentEbayReportAvailable =
    ebayReportCardId === card.id && ebayReportAvailable;
  const grokRequest: GrokRequestState = {
    loading: grokLoading,
    error: currentGrokError,
    response: currentGrokResponse,
  };
  const isActiveFeatureLoading =
    grokLoading ||
    (activeView === "prices" && (justTcgLoading || marketSalesLoading)) ||
    (activeView === "ebay_sold" && ebayLoading);
  const activeFeatureHasResponse =
    activeView === "prices"
      ? Boolean(
          currentGrokResponse &&
          currentJustTcgResult &&
          currentMarketSalesResponse,
        )
      : activeView === "ebay_sold"
        ? currentEbayReportAvailable
        : Boolean(currentGrokResponse);
  const activeFeatureActionDisabled =
    !authUser ||
    featureCooldown ||
    loadingSubscription ||
    updatingCredits ||
    !subscription ||
    creditsRemaining < 1 ||
    isActiveFeatureLoading;

  // RENDERING
  return (
    <div className="card-view ui-render-fade">
      <div className="card-view__panel-wrap">
        <div className="card-view__shell">
          <div className="card-view__details">
            <div className="card-view__image-side">
              <div className="card-view__image-frame">
                {authUser && (
                  <button
                    type="button"
                    className={`portfolio-toggle-button card-view__portfolio-toggle${
                      cardIsSaved ? " is-saved" : ""
                    }`}
                    disabled={portfolioBusy || portfolioUnavailable}
                    onClick={handlePortfolioToggle}
                    aria-label={
                      portfolioUnavailable
                        ? "Portfolio is unavailable"
                        : updatingPortfolio
                          ? "Updating portfolio"
                          : loadingPortfolioReferences
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
                          : loadingPortfolioReferences
                            ? "Checking portfolio"
                            : cardIsSaved
                              ? "Remove from portfolio"
                              : "Add to portfolio"
                    }
                  >
                    {portfolioBusy ? (
                      <span className="app-btn__spinner" aria-hidden="true" />
                    ) : (
                      <Star aria-hidden="true" />
                    )}
                  </button>
                )}
                {cardImageSrc && failedCardImageSrc !== cardImageSrc ? (
                  <img
                    key={card.id}
                    className="card-view__image ui-render-fade"
                    src={cardImageSrc}
                    alt={card.name}
                    onError={() => setFailedCardImageSrc(cardImageSrc)}
                  />
                ) : (
                  <div className="card-view__image-placeholder" role="img">
                    <Search aria-hidden="true" />
                    <span>Card image unavailable</span>
                  </div>
                )}
              </div>
              <div className="card-view__image-controls">
                <div className="card-view__change-card">
                  <Button
                    fill="ghost"
                    fullWidth
                    style={getCustomColors("blue")}
                    onClick={handleEmbeddedSearchToggle}
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
              </div>
            </div>

            <div className="card-view__info-side">
              <div className="card-view__identity">
                <div className="card-view__identity-top">
                  <div className="card-view__title-row">
                    <div className="card-view__title-copy">
                      {formattedDisplayedCardNumber && (
                        <span
                          className="card-view__title-number card-number-badge"
                          aria-label={`Card number ${formattedDisplayedCardNumber}`}
                        >
                          {formattedDisplayedCardNumber}
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
                          {card.set?.series && <span>({card.set.series})</span>}
                        </p>
                      )}
                      <div className="card-view__title-badges">
                        <Badge
                          accent={getRarityBadgeAccent(displayRarity)}
                          weight="strong"
                        >
                          {displayRarity}
                        </Badge>
                      </div>
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
                onSearchStart={scrollForEmbeddedSearch}
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
          {aiFeatures.map((aiFeature) => {
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
                onClick={() => setActiveView(aiFeature.view)}
                disabled={
                  loadingSubscription ||
                  updatingCredits ||
                  grokLoading ||
                  justTcgLoading ||
                  ebayLoading ||
                  marketSalesLoading
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
              className="card-view__active-feature ui-render-fade"
              style={getCustomColors(activeFeature.color)}
            >
              <CardFeatureHeader
                card={card}
                cardNumber={
                  activeView === "prices" ? displayedCardNumber : undefined
                }
                color={activeFeature.color}
                icon={activeFeature.icon}
                label={activeFeature.title}
                actionLabel={CARD_FEATURE_HEADER_ACTION_LABEL}
                actionCostLabel={activeFeature.actionCostLabel}
                actionLoading={
                  authLoading || loadingSubscription || isActiveFeatureLoading
                }
                actionDisabled={activeFeatureActionDisabled}
                actionHidden={activeFeatureHasResponse}
                onAction={() => void activeFeature.onOpen()}
                authActions={
                  !authUser && !authLoading && !loadingSubscription ? (
                    <>
                      <div className="card-feature-header__auth-row">
                        <Button
                          fill="ghost"
                          fitContent
                          style={getCustomColors(activeFeature.color)}
                          onClick={() => navigate("/signup")}
                        >
                          Sign up
                        </Button>
                        <Button
                          fill="solid"
                          fitContent
                          style={getCustomColors(activeFeature.color)}
                          onClick={() => setShowLoginModal(true)}
                        >
                          Log in
                        </Button>
                      </div>
                      <span className="card-feature-header__auth-divider">
                        or
                      </span>
                      <GoogleLoginButton
                        disabled={googleAuthLoading}
                        onClick={() => void handleGoogleAuth()}
                      />
                    </>
                  ) : undefined
                }
              />
              <div className="card-view__active-body">
                <div hidden={activeView !== "ebay_sold"}>
                  <EbaySoldView
                    card={card}
                    runToken={currentEbayRunToken}
                    onSubscriptionChange={updateSubscription}
                    onLoadingChange={setEbayLoading}
                    onReportAvailableChange={handleEbayReportAvailableChange}
                  />
                </div>
                {activeView === "prices" && (
                  <PriceAnalysis
                    card={card}
                    grokRequest={grokRequest}
                    reportLoading={
                      grokLoading || justTcgLoading || marketSalesLoading
                    }
                    reportAvailable={Boolean(
                      currentGrokResponse ||
                      currentJustTcgResult ||
                      currentMarketSalesResponse,
                    )}
                    salesDataRequest={{
                      loading: marketSalesLoading,
                      error: marketSalesError,
                      response: currentMarketSalesResponse,
                    }}
                    justTcgRequest={{
                      loading: justTcgLoading,
                      error: justTcgError,
                      response: currentJustTcgResult,
                    }}
                  />
                )}
                {activeView === "worth_grading" && (
                  <WorthGradingView grokRequest={grokRequest} />
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
