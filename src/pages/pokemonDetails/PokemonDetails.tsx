import { useEffect, useState, type CSSProperties } from "react";
import { useParams } from "react-router-dom";
import { BadgeDollarSign, Gem, LineChart, type LucideIcon } from "lucide-react";
import "./PokemonDetails.scss";
import "../../components/welcomeView/WelcomeView.scss";
import type { PokemonCard } from "../../types/pokemon";
import {
  getSelectedPokemonFromCache,
  setSelectedPokemonCache,
} from "../../utils/selectedPokemonCache";
import { getDominantColorFromImageUrl } from "../../utils/cardImageColor";
import { askGrok, type GrokRequestState } from "../../utils/grok/grokClient";
import {
  collectorsAnalysisPrompt,
  isWorthGradingPrompt,
  priceAnalysis,
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
import { fetchJustTcgCard } from "../../utils/fetchJustTcgCard";
import { JustTcgVariants } from "./views/JustTcgVariants/JustTcgVariants";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type CardInfoField = {
  label: string;
  value: string | number | undefined;
  highlight?: boolean;
};

type FlatPriceField = {
  label: string;
  value: number | string;
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
};

const AI_Features: AI_feature[] = [
  {
    view: "prices",
    title: "Markedspriser",
    description: "TCGPlayer og Cardmarket",
    icon: LineChart,
    color: "teal",
  },
  {
    view: "collector_analysis",
    title: "Samlerverdi",
    description: "AI-rangering for samlere",
    icon: Gem,
    color: "yellow",
  },
  {
    view: "ebay_sold",
    title: "eBay solgte",
    description: "Nylig solgte kort",
    icon: BadgeDollarSign,
    color: "orange",
  },
  {
    view: "worth_grading",
    title: "Worth grading?",
    description: "See if this card is worth getting PSA graded",
    icon: BadgeDollarSign,
    color: "pink",
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

function formatPriceLabel(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function flattenPriceFields(value: unknown, parentLabel = ""): FlatPriceField[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  return Object.entries(value).flatMap(([key, fieldValue]) => {
    const label = [parentLabel, formatPriceLabel(key)].filter(Boolean).join(" · ");

    if (typeof fieldValue === "number" || typeof fieldValue === "string") {
      return [{ label, value: fieldValue }];
    }

    return flattenPriceFields(fieldValue, label);
  });
}

function formatStoredPrice(value: number | string, currency: "USD" | "EUR") {
  if (typeof value !== "number") return value;

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(value);
}

function groupPriceFields(fields: FlatPriceField[], splitReverseHolo = false) {
  const groups = Object.entries(
    fields.reduce<Record<string, FlatPriceField[]>>((groups, field) => {
      const parts = field.label.split(" · ");
      const isReverseHolo = splitReverseHolo && field.label.startsWith("Reverse Holo ");
      const group = isReverseHolo
        ? "Reverse Holo"
        : parts.length > 1
          ? parts.shift() ?? "Prices"
          : "Prices";
      const groupedField = {
        ...field,
        label: isReverseHolo
          ? field.label.replace(/^Reverse Holo /, "")
          : parts.join(" · ") || field.label,
      };
      (groups[group] ??= []).push(groupedField);
      return groups;
    }, {})
  );

  return groups.map(([group, groupedFields]) => [
    group,
    [...groupedFields].sort((first, second) => {
      const firstIsHighlighted = /market|trend/i.test(first.label);
      const secondIsHighlighted = /market|trend/i.test(second.label);
      return Number(secondIsHighlighted) - Number(firstIsHighlighted);
    }),
  ] as const);
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
  const [glowColor, setGlowColor] = useState<string | null>(null);
  const [grokResponse, setGrokResponse] = useState("");
  const [grokError, setGrokError] = useState("");
  const [grokLoading, setGrokLoading] = useState(false);
  const [updatingPortfolio, setUpdatingPortfolio] = useState(false);
  const [justTcgLoading, setJustTcgLoading] = useState(false);
  const [justTcgError, setJustTcgError] = useState("");
  const [justTcgResult, setJustTcgResult] = useState<unknown>(null);
  const { savePokemonToPortfolio, removePokemonFromPortfolio } = usePokemonPortfolio();
  const { isCardSaved } = usePortfolioCache();

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

  async function handleJustTcgFetch() {
    if (!card || justTcgLoading) return;

    if (!card.number) {
      setJustTcgError("This card has no card number");
      return;
    }

    setJustTcgLoading(true);
    setJustTcgError("");
    setJustTcgResult(null);

    try {
      setJustTcgResult(await fetchJustTcgCard(card.name, card.number));
    } catch (error) {
      setJustTcgError(error instanceof Error ? error.message : "JustTCG request failed");
    } finally {
      setJustTcgLoading(false);
    }
  }

  async function handleFeatureClick(aiFeature: AI_feature) {
    setActiveView(aiFeature.view);

    if (
      aiFeature.view !== "prices" &&
      aiFeature.view !== "collector_analysis" &&
      aiFeature.view !== "worth_grading"
    ) {
      return;
    }

    const cardNameAndSet = [card?.name, card?.set?.name].filter(Boolean).join(" ");
    let prompt = "";

    if (aiFeature.view === "prices") {
      prompt = priceAnalysis;
    }

    if (aiFeature.view === "collector_analysis") {
      prompt = collectorsAnalysisPrompt(cardNameAndSet);
    }

    if (aiFeature.view === "worth_grading") {
      prompt = isWorthGradingPrompt(cardNameAndSet);
    }

    setGrokLoading(true);
    setGrokError("");
    setGrokResponse("");

    const result = await askGrok(prompt);

    if (!result.ok) {
      setGrokError(result.error);
    } else {
      setGrokResponse(result.text);
    }

    setGrokLoading(false);
  }

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
        console.error("Failed to load card:", error);
        setCard(null);
      } finally {
        setLoading(false);
      }
    }

    loadCard();
  }, [id]);

  useEffect(() => {
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

    const image = new Image();
    image.onload = () => setCardImageSrc(largeImage);
    image.src = largeImage;
  }, [card?.id, card?.images?.large, card?.images?.small]);

  useEffect(() => {
    if (!cardImageSrc) {
      setGlowColor(null);
      return;
    }

    let cancelled = false;

    getDominantColorFromImageUrl(cardImageSrc, API_URL).then((color) => {
      if (!cancelled && color) {
        setGlowColor(color);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cardImageSrc]);

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
  const tcgplayerPriceFields = flattenPriceFields(card.tcgplayer?.prices);
  const cardmarketPriceFields = flattenPriceFields(card.cardmarket?.prices);
  const hiddenCardmarketFields = new Set([
    "Low Price",
    "Low",
    "German Pro Low",
    "Suggested Price",
    "Low Price Ex Plus",
    "Avg1",
  ]);
  const visibleCardmarketPriceFields = cardmarketPriceFields.filter(
    (field) => {
      const fieldName = field.label
        .split(" · ")
        .at(-1)
        ?.replace(/^(?:Reverse Holo|Holo) /, "");

      return !fieldName || !hiddenCardmarketFields.has(fieldName);
    }
  );
  const hasStoredPrices = tcgplayerPriceFields.length > 0 || visibleCardmarketPriceFields.length > 0;
  const tcgplayerPriceGroups = groupPriceFields(tcgplayerPriceFields);
  const cardmarketPriceGroups = groupPriceFields(visibleCardmarketPriceFields, true);
  const tcgplayerMarketPrice = tcgplayerPriceFields.find((field) =>
    /market$/i.test(field.label)
  );
  const cardmarketTrendPrice = cardmarketPriceFields.find((field) =>
    /trend price$/i.test(field.label)
  );

  const imageGlowStyle = glowColor
    ? ({ "--card-glow": glowColor } as CSSProperties)
    : undefined;

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
          <div
            className={`card-view__image-side${glowColor ? " card-view__image-side--glow" : ""}`}
            style={imageGlowStyle}
          >
            <img className="card-view__image" src={cardImageSrc} alt={card.name} />
          </div>

          <div className="card-view__info-side">
            <h2 className="card-view__title">
              {card.name} - {card.set?.name}
            </h2>

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
                onClick={() => setActiveView("search_card")}
                aria-pressed={activeView === "search_card"}
              >
                <span>Change card</span>
              </Button>
              <Button disabled={justTcgLoading} onClick={handleJustTcgFetch}>
                <span>{justTcgLoading ? "Fetching..." : "just tcg api"}</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="card-view__actions feature-cards__row">
        {AI_Features.map((aiFeature) => {
          const Icon = aiFeature.icon;

          return (
            <button
              key={aiFeature.view}
              type="button"
              className={`feature-card${activeView === aiFeature.view ? " is-active" : ""}`}
              style={getCustomColors(aiFeature.color)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleFeatureClick(aiFeature)}
              aria-pressed={activeView === aiFeature.view}
            >
              <span className="feature-card__icon" aria-hidden="true">
                <Icon size={22} strokeWidth={2} />
              </span>
              <span className="feature-card__text">
                <span className="feature-card__title">{aiFeature.title}</span>
                <span className="feature-card__description">
                  {aiFeature.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <section className="card-view__page" aria-live="polite">

        {activeView === "empty_view" && (
          <div className="card-view__empty-view" aria-hidden="true">
            Empty view
          </div>
        )}

        {activeView === "search_card" && <DatabaseSearch />}
        {activeView === "ebay_sold" && <EbaySoldView card={card} />}
        {activeView === "prices" && (<PriceAnalysis grokRequest={grokRequest} />)}
        {activeView === "worth_grading" && (<WorthGradingView grokRequest={grokRequest} />)}
        {activeView === "collector_analysis" && (
          <CollectorAnalysis card={card} grokRequest={grokRequest} />
        )}
      </section>

      {hasStoredPrices && (
        <div className="card-view__stored-prices">
          <header className="card-view__stored-price-header">
            <h2>{card.name}</h2>
            <div>
              {card.rarity && <span>{card.rarity}</span>}
              {card.rarity && displayedCardNumber && <i>•</i>}
              {displayedCardNumber && <code>{displayedCardNumber}</code>}
              {(card.rarity || displayedCardNumber) && card.set?.name && <i>•</i>}
              {card.set?.name && <p>{card.set.name}</p>}
            </div>
          </header>

          <div className="card-view__stored-price-sources">
            {tcgplayerPriceFields.length > 0 && (
              <section className="card-view__stored-price-source card-view__stored-price-source--tcgplayer">
                <div className="card-view__stored-price-source-header">
                  <span>T</span><div><h3>TCGPlayer</h3><small>United States Market</small></div>
                  {tcgplayerMarketPrice && (
                    <div className="card-view__stored-price-summary">
                      <strong>{formatStoredPrice(tcgplayerMarketPrice.value, "USD")}</strong>
                    </div>
                  )}
                </div>
                <div className="card-view__stored-price-groups">
                  {tcgplayerPriceGroups.map(([group, fields]) => (
                    <section key={group}>
                      <h4>{group === "Prices" ? null : group}</h4>
                      {fields.map((field) => (
                        <div className={`card-view__stored-price${field.label.toLowerCase().includes("market") ? " card-view__stored-price--highlight" : ""}`} key={`${group}-${field.label}`}>
                          <span>{field.label}</span>
                          <strong>{formatStoredPrice(field.value, "USD")}</strong>
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
              </section>
            )}

            {visibleCardmarketPriceFields.length > 0 && (
              <section className="card-view__stored-price-source card-view__stored-price-source--cardmarket">
                <div className="card-view__stored-price-source-header">
                  <span>C</span><div><h3>Cardmarket</h3><small>EU Market</small></div>
                  {cardmarketTrendPrice && (
                    <div className="card-view__stored-price-summary">
                      <strong>{formatStoredPrice(cardmarketTrendPrice.value, "EUR")}</strong>
                    </div>
                  )}
                </div>
                <div className="card-view__stored-price-groups">
                  {cardmarketPriceGroups.map(([group, fields]) => (
                    <section key={group}>
                      <h4>{group === "Prices" ? null : group}</h4>
                      {fields.map((field) => (
                        <div className={`card-view__stored-price${field.label.toLowerCase().includes("trend") ? " card-view__stored-price--highlight" : ""}`} key={`${group}-${field.label}`}>
                          <span>{field.label}</span>
                          <strong>{formatStoredPrice(field.value, "EUR")}</strong>
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="card-view__price-legend">
            {tcgplayerPriceFields.length > 0 && (
              <section className="card-view__price-legend-source card-view__price-legend-source--tcgplayer">
                <div className="card-view__price-legend-header"><span>T</span><h3>TCGPlayer</h3></div>
                <p><strong>Market Price:</strong> Average based on recent sales</p>
                <p><strong>Low/Mid/High:  </strong>  Current listing range</p>
              </section>
            )}
            {visibleCardmarketPriceFields.length > 0 && (
              <section className="card-view__price-legend-source card-view__price-legend-source--cardmarket">
                <div className="card-view__price-legend-header"><span>C</span><h3>Cardmarket</h3></div>
                <p><strong>Trend Price:</strong> Algorithmic market value</p>
                <p><strong>Average Sell Price:</strong> On low-volume cards, a few premium sales can inflate the price heavily. Trend Price is average over all conditions and overall supply.</p>
              </section>
            )}
          </aside>

          {(card.tcgplayer?.updatedAt || card.cardmarket?.updatedAt) && (
            <p className="card-view__stored-price-updated">
              Prices fluctuate quickly • Data updated {card.tcgplayer?.updatedAt ?? card.cardmarket?.updatedAt}
            </p>
          )}
        </div>
      )}

      {(justTcgError || justTcgResult !== null) && (
        <div className="card-view__just-tcg-output">
          {justTcgError && <p className="card-view__page-error">{justTcgError}</p>}
          {justTcgResult !== null && <JustTcgVariants response={justTcgResult} />}
        </div>
      )}
    </div>
  );
}
