import { useEffect, useState, type CSSProperties } from "react";
import { useParams } from "react-router-dom";
import { Clock3, Gem, Landmark, Palette, Search, Users, type LucideIcon } from "lucide-react";
import "./PokemonDetails.scss";
import "../../components/frontpage/Frontpage.scss";
import type { PokemonCard } from "../../types/pokemon";
import {
  getSelectedPokemonFromCache,
  setSelectedPokemonCache,
} from "../../utils/selectedPokemonCache";
import { FEATURE_CARD_CONFIG } from "../../utils/featureCards";
import { getDominantColorFromImageUrl } from "../../utils/cardImageColor";
import { askGrok } from "../../utils/grok/grokClient";
import { collectorsAnalysis, marketPricesAnalysis } from "../../utils/grok/queryStrings";
import { DatabaseSearch } from "../../components/databaseSearch/DatabaseSearch";
import Button from "../../components/button/Button";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type CardInfoField = {
  label: string;
  value: string | number | undefined;
  highlight?: boolean;
};

type CollectorCategory = {
  name: string;
  score: string;
  text: string;
};

type CollectorAnalysis = {
  totalScore: string;
  overview: string;
  categories: CollectorCategory[];
  finalNote: string;
};

const collectorCategoryIcons: LucideIcon[] = [Gem, Users, Landmark, Palette, Clock3];

function parseCollectorAnalysis(response: string): CollectorAnalysis | null {
  let value: unknown = response.trim();

  if (typeof value === "string" && value.startsWith("```") && value.endsWith("```")) {
    value = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  for (let attempt = 0; attempt < 3 && typeof value === "string"; attempt += 1) {
    const source = value.trim();
    const withoutWrappingQuotes =
      source.length >= 2 && source.startsWith("'") && source.endsWith("'")
        ? source.slice(1, -1)
        : source;

    try {
      value = JSON.parse(withoutWrappingQuotes);
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.categories)) return null;

  const categories = data.categories
    .filter((category): category is Record<string, unknown> =>
      Boolean(category) && typeof category === "object" && !Array.isArray(category)
    )
    .map((category) => ({
      name: String(category.name ?? "Category"),
      score: String(category.score ?? "0"),
      text: String(category.text ?? ""),
    }));

  return {
    totalScore: String(data.totalScore ?? "0"),
    overview: String(data.overview ?? ""),
    categories,
    finalNote: String(data.finalNote ?? ""),
  };
}

function getCardSetInfoFields(card: PokemonCard): CardInfoField[] {
  return [
    { label: "Series", value: card.set?.series },
    { label: "Rarity", value: card.rarity ?? "N/A", highlight: true },
    { label: "Kortnummer", value: card.number },
    { label: "Printed Total", value: card.set?.printedTotal },
    { label: "Set ID", value: card.set?.id },
    { label: "Release Date", value: card.set?.releaseDate },
  ];
}

export default function PokemonDetails() {
  const { id } = useParams();
  const cachedCard = id ? getSelectedPokemonFromCache(id) : null;
  const [card, setCard] = useState<PokemonCard | null>(cachedCard);
  const [loading, setLoading] = useState(!cachedCard && Boolean(id));
  const [cardImageSrc, setCardImageSrc] = useState<string | undefined>(
    cachedCard?.images?.large ?? cachedCard?.images?.small
  );
  const [activeView, setActiveView] = useState("empty_view");
  const [glowColor, setGlowColor] = useState<string | null>(null);
  const [grokResponse, setGrokResponse] = useState("");
  const [grokError, setGrokError] = useState("");
  const [grokLoading, setGrokLoading] = useState(false);

  async function handleFeatureClick(featureId: string) {
    setActiveView(featureId);

    if (featureId !== "prices" && featureId !== "samlerverdi") return;

    const cardNameAndSet = [card?.name, card?.set?.name].filter(Boolean).join(" ");
    const prompt =
      featureId === "samlerverdi"
        ? collectorsAnalysis(cardNameAndSet)
        : marketPricesAnalysis;

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

  const infoFields = getCardSetInfoFields(card);

  const imageGlowStyle = glowColor
    ? ({ "--card-glow": glowColor } as CSSProperties)
    : undefined;

  const collectorAnalysis =
    activeView === "samlerverdi" && grokResponse
      ? parseCollectorAnalysis(grokResponse)
      : null;



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

            <Button
              className="card-view__change-card"
              onClick={() => setActiveView("search")}
              aria-pressed={activeView === "search"}
            >
              <Search size={17} strokeWidth={2} aria-hidden="true" />
              <span>Find new card</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="card-view__actions feature-cards__row">
        {FEATURE_CARD_CONFIG.map((feature) => {
          const Icon = feature.icon;

          return (
            <button
              key={feature.id}
              type="button"
              className={`feature-card${activeView === feature.id ? " is-active" : ""}`}
              style={{ "--feature-accent": feature.accent } as CSSProperties}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleFeatureClick(feature.id)}
              aria-pressed={activeView === feature.id}
            >
              <span className="feature-card__icon" aria-hidden="true">
                <Icon size={22} strokeWidth={2} />
              </span>
              <span className="feature-card__text">
                <span className="feature-card__title">{feature.title}</span>
                <span className="feature-card__description">
                  {feature.description}
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

        {activeView === "prices" && (
          <>
            {grokLoading && <p>Asking Grok...</p>}
            {grokError && <p className="card-view__page-error">{grokError}</p>}
            {!grokLoading && !grokError && grokResponse && <p>{grokResponse}</p>}
          </>
        )}

        {activeView === "samlerverdi" && (
          <>
            {grokLoading && <p>Asking Grok...</p>}
            {grokError && <p className="card-view__page-error">{grokError}</p>}
            {!grokLoading && !grokError && activeView === "samlerverdi" && collectorAnalysis && (
              <div className="collector-ranking">
                <header className="collector-ranking__heading">
                  <h3>{card.name}</h3>
                  <p>
                    {[card.number, card.set?.name, card.set?.series].filter(Boolean).join(" • ")}
                  </p>
                </header>

                <div className="collector-ranking__summary">
                  <div
                    className="collector-ranking__score"
                    style={{ "--score": Math.min(100, Math.max(0, Number(collectorAnalysis.totalScore) || 0)) } as CSSProperties}
                  >
                    <div>
                      <strong>{collectorAnalysis.totalScore}</strong>
                      <span>/100</span>
                    </div>
                  </div>
                  <div className="collector-ranking__overview">
                    <span>Overall score</span>
                    <h4>{collectorAnalysis.overview}</h4>
                  </div>
                </div>

                <div className="collector-ranking__categories">
                  {collectorAnalysis.categories.map((category, index) => {
                    const Icon = collectorCategoryIcons[index] ?? Gem;
                    const score = Math.min(100, Math.max(0, Number(category.score) || 0));

                    return (
                      <article key={`${category.name}-${index}`} className="collector-ranking__category">
                        <div className="collector-ranking__category-title">
                          <h4><Icon size={19} aria-hidden="true" />{category.name}</h4>
                          <strong>{category.score}</strong>
                        </div>
                        <div className="collector-ranking__bar" aria-label={`${category.name}: ${category.score} out of 100`}>
                          <span style={{ width: `${score}%` }} />
                        </div>
                        <p>{category.text}</p>
                      </article>
                    );
                  })}
                </div>

                {collectorAnalysis.finalNote && (
                  <section className="collector-ranking__conclusion">
                    <h4>Conclusion</h4>
                    <p>{collectorAnalysis.finalNote}</p>
                  </section>
                )}
              </div>
            )}
            {!grokLoading && !grokError && activeView === "samlerverdi" && grokResponse && !collectorAnalysis && (
              <p className="card-view__page-error">The collector analysis returned invalid JSON.</p>
            )}
          </>
        )}

        {activeView === "search" && <DatabaseSearch />}
        {activeView === "grader" && <p>Grading view</p>}
        {activeView === "portfolio" && <p>Portfolio view</p>}
        {activeView === "news" && <p>News view</p>}
      </section>
    </div>
  );
}
