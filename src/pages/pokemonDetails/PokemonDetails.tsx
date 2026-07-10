import { useEffect, useState, type CSSProperties } from "react";
import { useLocation, useParams } from "react-router-dom";
import "./PokemonDetails.scss";
import "../../components/frontpage/Frontpage.scss";
import type { PokemonCard } from "../../types/pokemon";
import { setSelectedPokemonCache } from "../../utils/selectedPokemonCache";
import { FEATURE_CARD_CONFIG } from "../../utils/featureCards";
import { getDominantColorFromImageUrl } from "../../utils/cardImageColor";
import { askGrok } from "../../utils/grok/grokClient";
import { collectorsAnalysis, marketPricesAnalysis } from "../../utils/grok/queryStrings";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type CardInfoField = {
  label: string;
  value: string | number | undefined;
  highlight?: boolean;
};

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
  const location = useLocation();
  const locationCard = (location.state as { card?: PokemonCard } | null)?.card;
  const stateCard = id && locationCard?.id === id ? locationCard : null;
  const [card, setCard] = useState<PokemonCard | null>(stateCard);
  const [loading, setLoading] = useState(!stateCard && Boolean(id));
  const [cardImageSrc, setCardImageSrc] = useState<string | undefined>(
    stateCard?.images?.large ?? stateCard?.images?.small
  );
  const [activeView, setActiveView] = useState(FEATURE_CARD_CONFIG[0].id);
  const [glowColor, setGlowColor] = useState<string | null>(null);
  const [grokResponse, setGrokResponse] = useState("");
  const [grokError, setGrokError] = useState("");
  const [grokLoading, setGrokLoading] = useState(false);

  async function handleFeatureClick(featureId: string) {
    setActiveView(featureId);

    if (featureId !== "prices" && featureId !== "samlerverdi") return;

    const prompt =
      featureId === "samlerverdi" ? collectorsAnalysis : marketPricesAnalysis;

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

      const routedCard = (location.state as { card?: PokemonCard } | null)?.card;
      if (id && routedCard?.id === id) {
        setCard(routedCard);
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
        {activeView === "prices" || activeView === "samlerverdi" ? (
          <>
            {grokLoading && <p>Asking Grok...</p>}
            {grokError && <p className="card-view__page-error">{grokError}</p>}
            {!grokLoading && !grokError && grokResponse && <p>{grokResponse}</p>}
          </>
        ) : (
          <p>hello</p>
        )}
      </section>
    </div>
  );
}
