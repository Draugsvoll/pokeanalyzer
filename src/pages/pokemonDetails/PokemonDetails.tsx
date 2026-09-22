import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowUp,
  BadgeDollarSign,
  Coins,
  Gem,
  LineChart,
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
import { askGrok, type GrokRequestState } from "../../utils/grok/grokClient";
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
import { MarketAnalysisView } from "./views/MarketAnalysis/MarketAnalysisView";
import { FEATURE_ERROR_MESSAGE } from "./views/featureError";
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
  CARD_FEATURE_VARIANTS_ID,
} from "./components/CardFeatureHeader";
import LoginModal from "../../components/loginmodal/Loginmodal";
import { signInWithGoogle } from "../../services/auth";
import { useAuth } from "../../context/authContextValue";
import { formatCardNumber } from "../../../shared/formatCardNumber";
import { normalizeCardVariant } from "../../../shared/normalizeCardVariant";
import { fetchCardById } from "../../services/cardApi";
import { getRarityBadgeAccent } from "../../utils/pokemonRarity";
import { PokeTraceMarketPrices } from "./components/PokeTraceMarketPrices";
import { SegmentedRadioGroup } from "../../components/ui/SegmentedRadioGroup";

type ActiveView =
  | "empty_view"
  | "collector_analysis"
  | "ebay_sold"
  | "prices"
  | "worth_grading";

type FeatureView = Exclude<ActiveView, "empty_view">;
type StoredGrokFeature =
  "collector_analysis" | "market_analysis" | "worth_grading";

type AiFeature = {
  view: FeatureView;
  title: string;
  description: string;
  icon: LucideIcon;
  color: CustomColors;
  featureKey: CreditUsageFeature;
  onOpen: () => Promise<void>;
};

function formatVariantName(variant: string) {
  return variant
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getDemoFeatureResponse(
  card: PokemonCard,
  feature: CreditUsageFeature,
) {
  if (feature === "collector_analysis") return card.grok?.collectors_analysis;
  if (feature === "market_analysis") return card.grok?.market_analysis;
  if (feature === "worth_grading") return card.grok?.worth_grading;
  return undefined;
}

function getPrefetchedVariantCard(
  state: unknown,
  cardId: string | undefined,
): PokemonCard | null {
  if (!state || typeof state !== "object" || !cardId) return null;

  const navigationState = state as {
    card?: PokemonCard;
    navigationSource?: string;
  };

  return navigationState.navigationSource === "card-variant" &&
    navigationState.card?.id === cardId
    ? navigationState.card
    : null;
}

function PokemonDetailsForCard() {
  const { id } = useParams();
  const isDemo = id === "demo";
  const location = useLocation();
  const navigate = useNavigate();
  const cardRequestSequenceRef = useRef(0);
  const variantRequestSequenceRef = useRef(0);
  const variantRequestAbortRef = useRef<AbortController | null>(null);
  const routeCardIdRef = useRef(id);
  const prefetchedVariantCard = useMemo(
    () => getPrefetchedVariantCard(location.state, id),
    [id, location.state],
  );
  const cachedCard = useMemo(
    () =>
      prefetchedVariantCard ??
      (id && !isDemo ? getSelectedPokemonFromCache(id) : null),
    [id, isDemo, prefetchedVariantCard],
  );
  const skipInitialCardRequestRef = useRef(prefetchedVariantCard?.id);
  const [cardRequestState, setCardRequestState] = useState<{
    card: PokemonCard | null;
    cardId: string | undefined;
    loading: boolean;
  }>(() => ({
    card: cachedCard,
    cardId: id,
    loading: !cachedCard && Boolean(id),
  }));
  const [refreshingCard, setRefreshingCard] = useState(
    Boolean(cachedCard && id && !prefetchedVariantCard),
  );
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
  const [activeView, setActiveView] = useState<ActiveView>("ebay_sold");
  const [cardSearchCardId, setCardSearchCardId] = useState<string | null>(null);
  const showCardSearch = Boolean(id && cardSearchCardId === id);
  const [grokResponses, setGrokResponses] = useState<
    Partial<Record<CreditUsageFeature, string>>
  >({});
  const [grokErrors, setGrokErrors] = useState<
    Partial<Record<CreditUsageFeature, string>>
  >({});
  const [grokLoading, setGrokLoading] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [googleAuthLoading, setGoogleAuthLoading] = useState(false);
  const [updatingPortfolio, setUpdatingPortfolio] = useState(false);
  const [ebayLoading, setEbayLoading] = useState(false);
  const [ebayRunToken, setEbayRunToken] = useState(0);
  const [ebayRunCardId, setEbayRunCardId] = useState<string | null>(null);
  const [ebayReportAvailable, setEbayReportAvailable] = useState(false);
  const [ebayReportCardId, setEbayReportCardId] = useState<string | null>(null);
  const [featureCooldown, setFeatureCooldown] = useState(false);
  const [loadingVariantId, setLoadingVariantId] = useState<string | null>(null);
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

  function openEmbeddedSearch() {
    setCardSearchCardId(id ?? null);
  }

  async function handleVariantChange(variantId: string) {
    if (variantId === card?.id) return;

    variantRequestAbortRef.current?.abort();
    const controller = new AbortController();
    const requestSequence = ++variantRequestSequenceRef.current;
    variantRequestAbortRef.current = controller;
    setLoadingVariantId(variantId);

    try {
      const variantCard = await fetchCardById(variantId, controller.signal);
      if (
        controller.signal.aborted ||
        variantRequestSequenceRef.current !== requestSequence
      ) {
        return;
      }

      try {
        setSelectedPokemonCache(variantCard);
      } catch (cacheError) {
        logClientError("Failed to cache card variant", cacheError);
      }
      navigate(`/card/${encodeURIComponent(variantId)}`, {
        state: {
          card: variantCard,
          navigationSource: "card-variant",
        },
      });
    } catch (error) {
      if (!isAbortError(error)) {
        logClientError("Failed to load card variant", error);
      }
    } finally {
      if (variantRequestSequenceRef.current === requestSequence) {
        variantRequestAbortRef.current = null;
        setLoadingVariantId(null);
      }
    }
  }

  function handleEmbeddedSearchToggle() {
    if (showCardSearch) {
      setCardSearchCardId(null);
      return;
    }

    openEmbeddedSearch();
  }

  useEffect(() => {
    if (!showCardSearch) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCardSearchCardId(null);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showCardSearch]);
  const { loadingSubscription, subscription, updateSubscription } =
    useMembershipSubscription();
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

  useEffect(
    () => () => {
      variantRequestSequenceRef.current += 1;
      variantRequestAbortRef.current?.abort();
    },
    [],
  );

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
    return requestStoredGrokAnalysis("market_analysis", signal);
  }

  async function runPaidFeatureAction(
    view: FeatureView,
    action: () => void | Promise<void>,
  ) {
    if (
      isDemo ||
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

  async function requestStoredGrokAnalysis(
    featureKey: StoredGrokFeature,
    requestSignal?: AbortSignal,
  ) {
    if (!card) return false;

    setGrokLoading(true);
    updateGrokError(featureKey, "");
    updateGrokResponse(featureKey, "");

    const signal = requestSignal ?? startRequest();
    try {
      const result = await askGrok(featureKey, {
        signal,
        cardId: card.id,
        cardName: card.name,
        cardNumber: card.number ?? "",
        setName: card.set?.name ?? "",
        ...(featureKey === "worth_grading" && {
          variantName: normalizeCardVariant(card.pokeTrace.variant) || "normal",
        }),
      });
      if (signal.aborted) return false;

      if (!result.ok) {
        updateGrokError(featureKey, FEATURE_ERROR_MESSAGE);
        return false;
      } else {
        updateSubscription(result.subscription);
        if (result.fromDatabase) {
          await waitForStoredResponse(signal);
        }
        if (signal.aborted) return false;
        updateGrokResponse(featureKey, result.text);
        return true;
      }
    } catch (error) {
      if (!isAbortError(error)) {
        updateGrokError(featureKey, FEATURE_ERROR_MESSAGE);
      }
      return false;
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
    await runPaidFeatureAction("collector_analysis", async () => {
      await requestStoredGrokAnalysis("collector_analysis");
    });
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
    await runPaidFeatureAction("worth_grading", async () => {
      await requestStoredGrokAnalysis("worth_grading");
    });
  }

  const aiFeatures: AiFeature[] = [
    {
      view: "ebay_sold",
      title: "eBay Comps",
      description: "Show completed sales & active listings.",
      icon: BadgeDollarSign,
      color: "teal",
      featureKey: "ebay_sold",
      onOpen: openEbayAnalysis,
    },
    {
      view: "prices",
      title: "Market Analysis",
      description:
        "Scan markets to show you the cards activity and relevant metrics.",
      icon: LineChart,
      color: "orange",
      featureKey: "market_analysis",
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
      view: "worth_grading",
      title: "Grading",
      description: "PSA economics for this card",
      icon: ScanSearch,
      color: "pink",
      featureKey: "worth_grading",
      onOpen: openWorthGradingAnalysis,
    },
  ];

  useEffect(() => {
    const requestSequence = ++cardRequestSequenceRef.current;
    if (!id) return;

    if (skipInitialCardRequestRef.current === id) {
      skipInitialCardRequestRef.current = undefined;
      return;
    }

    const controller = new AbortController();
    setRefreshingCard(Boolean(cachedCard));

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
        setRefreshingCard(false);
        if (!isDemo) {
          try {
            setSelectedPokemonCache(fetchedCard);
          } catch (cacheError) {
            logClientError("Failed to refresh selected card cache", cacheError);
          }
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
        setRefreshingCard(false);
      });

    return () => {
      cardRequestSequenceRef.current += 1;
      controller.abort();
    };
  }, [cachedCard, id, isDemo]);

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
      <div className="card-view card-view--poketrace ui-render-fade">
        <div className="card-view__panel-wrap">
          <div className="card-view__shell default-container">
            <div className="card-view__details">
              <div aria-hidden="true" className="card-view__loading-image" />
              <div className="card-view__info-side">
                <PokeTraceMarketPrices
                  cardId=""
                  data={{ currency: "USD", marketplaceUrls: {}, prices: {} }}
                  loadingMarketData
                />
              </div>
            </div>
          </div>
        </div>
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

  const displayedCardNumber = card.number;
  const formattedDisplayedCardNumber = formatCardNumber(
    card,
    displayedCardNumber,
  );
  const displayRarity = card.rarity?.trim() || "N/A";
  const pokeTraceVariants = card.pokeTrace.variants?.length
    ? card.pokeTrace.variants
    : [
        {
          id: card.id,
          name: card.pokeTrace.variant?.trim() || "Normal",
        },
      ];
  const cardIsSaved = !isDemo && isCardSaved(card.id);
  const portfolioBusy =
    updatingPortfolio || (Boolean(authUser) && loadingPortfolioReferences);
  const portfolioUnavailable =
    Boolean(authUser) && Boolean(portfolioReferencesError);
  const activeFeature = aiFeatures.find(
    (feature) => feature.view === activeView,
  );
  const currentGrokResponse = activeFeature
    ? isDemo
      ? JSON.stringify(
          getDemoFeatureResponse(card, activeFeature.featureKey) ?? {},
        )
      : (grokResponses[activeFeature.featureKey] ?? "")
    : "";
  const currentGrokError = activeFeature
    ? (grokErrors[activeFeature.featureKey] ?? "")
    : "";
  const currentEbayRunToken = isDemo
    ? 1
    : ebayRunCardId === card.id
      ? ebayRunToken
      : 0;
  const currentEbayReportAvailable =
    isDemo || (ebayReportCardId === card.id && ebayReportAvailable);
  const grokRequest: GrokRequestState = {
    loading: grokLoading,
    error: currentGrokError,
    response: currentGrokResponse,
  };
  const isActiveFeatureLoading =
    grokLoading || (activeView === "ebay_sold" && ebayLoading);
  const activeFeatureHasResponse =
    isDemo ||
    (activeView === "prices"
      ? Boolean(currentGrokResponse)
      : activeView === "ebay_sold"
        ? currentEbayReportAvailable
        : Boolean(currentGrokResponse));
  const activeFeatureActionDisabled =
    isDemo ||
    !authUser ||
    featureCooldown ||
    loadingSubscription ||
    updatingCredits ||
    !subscription ||
    creditsRemaining < 1 ||
    isActiveFeatureLoading;
  const shouldAddCredits =
    !isDemo &&
    Boolean(authUser) &&
    Boolean(subscription) &&
    !loadingSubscription &&
    !updatingCredits &&
    creditsRemaining === 0;

  // RENDERING
  return (
    <div className="card-view card-view--poketrace ui-render-fade">
      <div className="card-view__panel-wrap">
        <div
          aria-busy={Boolean(loadingVariantId) || refreshingCard}
          className="card-view__shell default-container"
        >
          <div className="card-view__details">
            <div className="card-view__image-side">
              <div className="card-view__image-frame">
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
                {authUser && !isDemo && (
                  <Button
                    fullWidth
                    variant="portfolio"
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
                  >
                    {portfolioBusy ? (
                      <span className="app-btn__spinner" aria-hidden="true" />
                    ) : (
                      <>
                        <Star aria-hidden="true" />
                        <span>Portfolio</span>
                      </>
                    )}
                  </Button>
                )}
                <div className="card-view__change-card">
                  <Button
                    fill="ghost"
                    fullWidth
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
                        <span>New Card</span>
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
                      <div className="card-view__product-meta">
                        {card.set?.name && (
                          <span className="card-view__product-set">
                            {card.set.name}
                          </span>
                        )}
                        <span className="card-view__rarity-badge">
                          <Badge
                            accent={getRarityBadgeAccent(displayRarity)}
                            size="md"
                            weight="strong"
                          >
                            {displayRarity}
                          </Badge>
                        </span>
                        {pokeTraceVariants.length > 0 && (
                          <SegmentedRadioGroup
                            ariaLabel="Card variant"
                            className="card-view__variant-selector"
                            disabled={Boolean(loadingVariantId)}
                            name={`card-variant-${card.id}`}
                            onChange={(variantId) => {
                              void handleVariantChange(variantId);
                            }}
                            options={pokeTraceVariants.map((variant) => ({
                              label: formatVariantName(variant.name),
                              value: variant.id,
                            }))}
                            value={card.id}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <PokeTraceMarketPrices
                  cardId={card.id}
                  data={card.pokeTrace}
                  loadingMarketData={
                    refreshingCard || Boolean(loadingVariantId)
                  }
                />
              </div>
            </div>
          </div>

          {loadingVariantId && (
            <div
              aria-label="Loading variant"
              className="card-view__variant-loading"
              role="status"
            >
              <span
                aria-hidden="true"
                className="card-view__variant-loading-spinner"
              />
            </div>
          )}
          {refreshingCard && !loadingVariantId && (
            <span
              aria-label="Loading complete card details"
              className="card-view__data-loading"
              role="status"
            />
          )}
        </div>
      </div>

      {showCardSearch &&
        createPortal(
          <div
            aria-label="Switch card"
            aria-modal="true"
            className="card-view__search-overlay ui-render-fade"
            onMouseDown={(event) => {
              const target = event.target;
              const clickedScrollbar =
                target === event.currentTarget &&
                event.clientX >= event.currentTarget.clientWidth;
              if (clickedScrollbar) return;
              if (
                target instanceof Element &&
                target.closest(".database-search-bar, .search-results")
              ) {
                return;
              }
              setCardSearchCardId(null);
            }}
            role="dialog"
          >
            <div className="card-view__search-modal">
              <DatabaseSearch
                autoFocusName
                embedded
                onClose={() => setCardSearchCardId(null)}
              />
            </div>
          </div>,
          document.body,
        )}

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />

      {isDemo ? (
        <aside className="card-view__credit-bar" role="note">
          <span className="card-view__credit-note card-view__credit-note--demo">
            Demo snapshot: prices and analyses are not live data.
          </span>
        </aside>
      ) : (
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
              <strong>Credit</strong>
              <span className="card-view__credit-meta">pay per-feature</span>
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
                  <Button
                    variant="micro"
                    onClick={() => setShowLoginModal(true)}
                  >
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
              <small className="card-view__credit-message">
                {creditMessage}
              </small>
            )}
          </div>
        </div>
      )}

      <section className="card-view__analysis-panel">
        <div className="card-view__actions feature-buttons__row">
          {aiFeatures.map((aiFeature) => {
            const Icon = aiFeature.icon;
            const isFeatureLoading =
              activeView === aiFeature.view &&
              (grokLoading || (aiFeature.view === "ebay_sold" && ebayLoading));

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
                  ebayLoading
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
              {!activeFeatureHasResponse && (
                <CardFeatureHeader
                  card={card}
                  cardNumber={
                    activeView === "prices" ? displayedCardNumber : undefined
                  }
                  color={activeFeature.color}
                  icon={activeFeature.icon}
                  label={activeFeature.title}
                  actionLabel={
                    shouldAddCredits
                      ? "Add credits"
                      : CARD_FEATURE_HEADER_ACTION_LABEL
                  }
                  actionLoading={
                    authLoading || loadingSubscription || isActiveFeatureLoading
                  }
                  actionDisabled={
                    shouldAddCredits ? false : activeFeatureActionDisabled
                  }
                  onAction={
                    shouldAddCredits
                      ? () => navigate("/profile")
                      : () => void activeFeature.onOpen()
                  }
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
              )}
              <div
                className="card-view__active-variants card-feature-header__variants"
                id={CARD_FEATURE_VARIANTS_ID}
              />
              <div className="card-view__active-body">
                <div hidden={activeView !== "ebay_sold"}>
                  <EbaySoldView
                    card={card}
                    demoResponse={isDemo ? card.grok?.ebay_sold : undefined}
                    runToken={currentEbayRunToken}
                    onSubscriptionChange={updateSubscription}
                    onLoadingChange={setEbayLoading}
                    onReportAvailableChange={handleEbayReportAvailableChange}
                  />
                </div>
                {activeView === "prices" && (
                  <MarketAnalysisView grokRequest={grokRequest} />
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
