import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { usePortfolioCache } from "../../context/PortfolioCacheContext";
import "./PokemonDetails.scss";
import Button from "../../components/button/Button";
import { SELECTED_POKEMON_CACHE_KEY } from "../../constants/cache";
import type { PokemonCard } from "../../types/pokemon";
import { getBestTcgPlayerVariantName, getBestTcgPlayerVariant, TCG_PLAYER_VARIANT_ORDER } from "../../utils/pokemonPricing";
import {
  getEbayCompsQuery,
  getVisibleEbayCompResults,
  type EbayCompsResponse,
} from "../../utils/ebayComps";
import { usePokemonPortfolio } from "../../hooks/pokemonPortfolio";
import { formatTimestampDateTime } from "../../utils/timestamp";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export default function CardDetails() {
  const { id } = useParams();
  const { user: authUser } = useAuth();
  const { isCardSaved } = usePortfolioCache();
  const { savePokemonToPortfolio, removePokemonFromPortfolio } = usePokemonPortfolio();
  const [card, setCard] = useState<PokemonCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ebayComps, setEbayComps] = useState<EbayCompsResponse | null>(null);
  const [ebayCompsLoading, setEbayCompsLoading] = useState(false);
  const [ebayCompsError, setEbayCompsError] = useState<string | null>(null);

  const alreadySaved = id ? isCardSaved(id) : false;

  useEffect(() => {
    async function loadCard() {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        const storedCard = localStorage.getItem(SELECTED_POKEMON_CACHE_KEY);
        const parsedCard = storedCard
          ? (JSON.parse(storedCard) as PokemonCard)
          : null;

        if (parsedCard?.id === id) {
          setCard(parsedCard);
          return;
        }

        const res = await fetch(`${API_URL}/api/cards/${id}`);

        if (!res.ok) {
          setCard(null);
          return;
        }

        const fetchedCard = (await res.json()) as PokemonCard;

        localStorage.setItem(
          SELECTED_POKEMON_CACHE_KEY,
          JSON.stringify(fetchedCard)
        );

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

  const handleSaveToPortfolio = async () => {
    if (!authUser) {
      alert("Du må være logget inn for å lagre kort.");
      return;
    }

    if (!card) {
      alert("Error: Kortet er ikke tilgjengelig for lagring.");
      return;
    }

    try {
      setSaving(true);

      const saved = await savePokemonToPortfolio(card);

      if (saved) {
        alert("Kortet ble lagret i porteføljen.");
      }
    } catch (error) {
      console.error("Failed to save card:", error);
      alert("Kunne ikke lagre kortet.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFromPortfolio = async () => {
    if (!authUser) {
      alert("Du må være logget inn.");
      return;
    }

    if (!id) return;

    try {
      setSaving(true);

      const removed = await removePokemonFromPortfolio(id);

      if (removed) {
        alert("Kortet ble fjernet fra porteføljen.");
      }
    } catch (error) {
      console.error("Failed to remove card:", error);
      alert("Kunne ikke fjerne kortet.");
    } finally {
      setSaving(false);
    }
  };

  const formatPrice = (value: number | null | undefined, currency = "") =>
    value != null ? `${currency}${value.toFixed(2)}` : "N/A";

  const handleTogglePortfolio = () => {
    if (alreadySaved) {
      handleRemoveFromPortfolio();
    } else {
      handleSaveToPortfolio();
    }
  };

  const chosenTcgVariant = getBestTcgPlayerVariantName(card?.tcgplayer?.prices);
  const ebayCompResults =
    ebayComps !== null ? getVisibleEbayCompResults(ebayComps) : [];

  const handleFetchEbayComps = async () => {
    if (!card) return;

    try {
      setEbayCompsLoading(true);
      setEbayCompsError(null);

      const query = getEbayCompsQuery(card);
      const res = await fetch(`${API_URL}/ebay?q=${encodeURIComponent(query)}`);

      if (!res.ok) {
        throw new Error(`EbayComps request failed with status ${res.status}`);
      }

      setEbayComps(await res.json());
    } catch (error) {
      console.error("Failed to fetch EbayComps:", error);
      setEbayCompsError(
        error instanceof Error ? error.message : "Failed to fetch Ebay prices"
      );
    } finally {
      setEbayCompsLoading(false);
    }
  };

  if (loading) return <h1>Loading Pokémon...</h1>;
  if (!card) return <h1>Couldn't find Pokémon</h1>;

  return (
    <div className="card-view">
      <div className="name">
        <h1>
          {card.name} - {card.set?.name}
        </h1>
      </div>

      <div className="card-view__mediaPriceBox">
        <div className="card-view__imageBox">
          <img
            className="card-view__image"
            src={card.images?.large}
            alt={card.name}
          />
        </div>

        <div className="card-view__rightColumn">
          <div className="card-view__info">
            <h2>Set Info</h2>

            <div className="set-name-row">
              {card.set?.images?.logo && (
                <img
                  src={card.set.images.logo}
                  alt="set logo"
                  className="set-logo"
                />
              )}
            </div>

            <p>
              <b>Set ID:</b> {card.set?.id}
            </p>
            <p>
              <b>Set name:</b> {card.set?.name}
            </p>
            <p>
              <b>Set series:</b> {card.set?.series}
            </p>
            <p>
              <b>cardnumber:</b> {card.number}
            </p>
            <p>
              <b>Printed Total:</b> {card.set?.printedTotal}
            </p>
            <p>
              <b>Total Cards:</b> {card.set?.total}
            </p>
            <p>
              <b>Release Date:</b> {card.set?.releaseDate}
            </p>
            <p>
              <b>Updated At:</b> {card.set?.updatedAt}
            </p>
            <p>
              <b>PTCGO Code:</b> {card.set?.ptcgoCode ?? "N/A"}
            </p>
            <p>
              <b>Unlimited Legal:</b> {card.set?.legalities?.unlimited}
            </p>
          </div>
        </div>
      </div>

      <div className="card-view__price">
        <h2>Prices</h2>

        <div className="ebay-prices">
          <Button onClick={handleFetchEbayComps} disabled={ebayCompsLoading}>
            {ebayCompsLoading ? "Loading Ebay prices..." : "Ebay prices"}
          </Button>

          {ebayCompsError && (
            <p className="ebay-prices__error">{ebayCompsError}</p>
          )}

          {ebayComps !== null && (
            <div className="ebay-prices__results">
              {ebayCompResults.map((ebayComp, index) => (
                <div className="ebay-prices__card" key={index}>
                  {ebayComp.thumbnailUrl && (
                    <img
                      className="ebay-prices__image"
                      src={ebayComp.thumbnailUrl}
                      alt="Ebay sold listing"
                      loading="lazy"
                    />
                  )}

                  <div className="ebay-prices__fields">
                  {ebayComp.fields.map((field) => (
                    <div className="ebay-prices__field" key={field.key}>
                      <b>{field.key}</b>
                      {field.key.toLowerCase() === "url" ? (
                        <a
                          href={field.value}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {field.value}
                        </a>
                      ) : (
                        <span>{field.value}</span>
                      )}
                    </div>
                  ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="price-overview">
          <div className="price-overview__section">
            <h3>TCGPlayer</h3>
            <p className="price-overview__note">
              {getBestTcgPlayerVariantName(card?.tcgplayer?.prices) ?? "best available"} pricing.
            </p>
            {(() => {
              const variant = getBestTcgPlayerVariant(card?.tcgplayer?.prices);
              return (
                <>
                  <p>
                    <b>Market</b>
                    <span>{formatPrice(variant?.market, "$")}</span>
                  </p>
                  <p>
                    <b>Low</b>
                    <span>{formatPrice(variant?.low, "$")}</span>
                  </p>
                  <p>
                    <b>Mid</b>
                    <span>{formatPrice(variant?.mid, "$")}</span>
                  </p>
                  <p>
                    <b>High</b>
                    <span>{formatPrice(variant?.high, "$")}</span>
                  </p>
                  <p>
                    <b>Direct low</b>
                    <span>{formatPrice(variant?.directLow, "$")}</span>
                  </p>
                  <p className="price-overview__updated">
                    Updated: {formatTimestampDateTime(card?.tcgplayer?.updatedAt)}
                  </p>
                </>
              );
            })()}
          </div>

          <div className="price-overview__section">
            <h3>Cardmarket</h3>

            {(() => {
              const cm = (card.cardmarket?.prices ?? {}) as Record<string, any>;
              const excluded = [
                "lowPriceExPlus",
                "germanProLow",
                "suggestedPrice",
              ];

              const labelMap: Record<string, string> = {
                trendPrice: "Trend",
                averageSellPrice: "Avg sell",
                lowPrice: "Low",
                germanProLow: "German low",
                suggestedPrice: "Suggested",
              };

              return Object.keys(cm)
                .filter((k) => !excluded.includes(k) && cm[k] != null && cm[k] !== 0)
                .map((k) => (
                  <p key={k}>
                    <b>{labelMap[k] ?? k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}</b>
                    <span>{formatPrice(cm[k], "€")}</span>
                  </p>
                ));
            })()}

            <p className="price-overview__updated">
              Updated: {formatTimestampDateTime(card.cardmarket?.updatedAt)}
            </p>
          </div>
        </div>

        <div className="card-view__buttons">
          <Button onClick={handleTogglePortfolio} disabled={saving}>
            {saving
              ? alreadySaved
                ? "Fjerner..."
                : "Lagrer..."
              : alreadySaved
              ? "Fjern fra portefølje"
              : "Legg til i portefølje"}
          </Button>
        </div>
      </div>

      <div className="card-view__bottom">
        <div className="card-view__section">
          <h2>Weaknesses</h2>
          {card.weaknesses?.map((w: any, i: any) => (
            <p key={i}>
              {w.type} ({w.value})
            </p>
          ))}
        </div>

        <div className="card-view__section">
          <h2>Resistances</h2>
          {card.resistances?.map((r, i) => (
            <p key={i}>
              {r.type} ({r.value})
            </p>
          ))}
        </div>

        <div className="card-view__section">
          <h2>Retreat Cost</h2>
          <p>{card.retreatCost?.join(", ") ?? "N/A"}</p>
        </div>

        <div className="card-view__section">
          <h2>Legalities</h2>
          <p>{card.legalities?.unlimited}</p>
        </div>

        <div className="card-view__section">
          <h2>Flavor Text</h2>
          <p>{card.flavorText}</p>
        </div>

        <div className="card-view__section card-view__attacks">
          <h2>Attacks</h2>

          {card.attacks?.map((attack: any, i:any) => (
            <div key={i} className="attack">
              <h3>{attack.name}</h3>
              <p>
                <b>Damage:</b> {attack.damage}
              </p>
              <p>
                <b>Cost:</b> {attack.cost?.join(", ")}
              </p>
              <p>{attack.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
