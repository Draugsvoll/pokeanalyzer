import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { GridView } from "../../components/gridView/GridView";
import { PokemonCard } from "../../components/pokemonCard/PokemonCard";
import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import { usePokemonPortfolio } from "../../hooks/pokemonPortfolio";
import type { PokemonCard as PokemonCardType } from "../../types/pokemon";
import { getTcgPlayerMarketPrice } from "../../utils/pokemonPricing";
import "./Portfolio.scss";

type EstimatedValueSource = "tcgplayer" | "cardmarket";
type PortfolioSort = "default" | "price_desc" | "price_asc";

function getEstimatedCardPrice(
  card: PokemonCardType,
  source: EstimatedValueSource,
) {
  if (source === "tcgplayer") {
    return getTcgPlayerMarketPrice(card.tcgplayer?.prices);
  }

  return card.cardmarket?.prices.trendPrice;
}

function getPortfolioCardQuantity(card: PokemonCardType) {
  const quantity = Number(card.quantity ?? 1);
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1;
}

export default function Portfolio() {
  const { user, loading: authLoading } = useAuth();
  const { portfolio, loadingPortfolio } = usePortfolioCache();
  const { removePokemonFromPortfolio, updatePokemonQuantity } = usePokemonPortfolio();
  const [updatingQuantityId, setUpdatingQuantityId] = useState<string | null>(null);
  const [pendingQuantity, setPendingQuantity] = useState<{
    cardId: string;
    quantity: number;
  } | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{
    cardId: string;
    cardName: string;
  } | null>(null);
  const [estimatedValueSource, setEstimatedValueSource] =
    useState<EstimatedValueSource>("tcgplayer");
  const [portfolioSort, setPortfolioSort] = useState<PortfolioSort>("default");

  const { estimatedCollectionValue, missingPriceCount } = useMemo(() => (
    portfolio.reduce(
      (summary, card) => {
        const quantity = getPortfolioCardQuantity(card);
        const marketPrice = getEstimatedCardPrice(card, estimatedValueSource);

        if (marketPrice == null) {
          summary.missingPriceCount += quantity;
        } else {
          summary.estimatedCollectionValue += marketPrice * quantity;
        }

        return summary;
      },
      { estimatedCollectionValue: 0, missingPriceCount: 0 },
    )
  ), [estimatedValueSource, portfolio]);
  const missingPriceMessage = missingPriceCount === 0
    ? null
    : `${missingPriceCount} card${missingPriceCount === 1 ? "" : "s"} missing price`;
  const estimatedCollectionValueLabel = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: estimatedValueSource === "tcgplayer" ? "USD" : "EUR",
  }).format(estimatedCollectionValue);
  const sortedPortfolio = useMemo(() => {
    if (portfolioSort === "default") return portfolio;

    return [...portfolio].sort((firstCard, secondCard) => {
      const firstPrice = getEstimatedCardPrice(firstCard, estimatedValueSource);
      const secondPrice = getEstimatedCardPrice(secondCard, estimatedValueSource);

      if (firstPrice == null && secondPrice == null) return 0;
      if (firstPrice == null) return 1;
      if (secondPrice == null) return -1;

      return portfolioSort === "price_desc"
        ? secondPrice - firstPrice
        : firstPrice - secondPrice;
    });
  }, [estimatedValueSource, portfolio, portfolioSort]);

  const requestQuantityChange = (card: PokemonCardType, amount: number) => {
    if (updatingQuantityId) return;

    const currentQuantity = pendingQuantity?.cardId === card.id
      ? pendingQuantity.quantity
      : card.quantity ?? 1;
    const nextQuantity = currentQuantity + amount;
    if (nextQuantity < 1) return;

    setPendingQuantity({ cardId: card.id, quantity: nextQuantity });
  };

  const confirmQuantityChange = async () => {
    if (!pendingQuantity) return;

    setUpdatingQuantityId(pendingQuantity.cardId);
    await updatePokemonQuantity(pendingQuantity.cardId, pendingQuantity.quantity);
    setUpdatingQuantityId(null);
    setPendingQuantity(null);
  };

  const confirmRemoval = async () => {
    if (!pendingRemoval) return;

    await removePokemonFromPortfolio(pendingRemoval.cardId, false);
    setPendingRemoval(null);
  };

  useEffect(() => {
    if (!pendingQuantity && !pendingRemoval) return;

    const cancelWhenClickingOutside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          ".portfolio__quantity-confirm, .portfolio__quantity-control, .portfolio__quantity-display",
        )
      ) return;
      setPendingQuantity(null);
      setPendingRemoval(null);
    };

    document.addEventListener("pointerdown", cancelWhenClickingOutside);
    return () => document.removeEventListener("pointerdown", cancelWhenClickingOutside);
  }, [pendingQuantity, pendingRemoval]);

  if (authLoading || loadingPortfolio) {
    return <main className="portfolio portfolio--status ui-render-fade" key="loading"><h1>Loading collection...</h1></main>;
  }

  if (!user) {
    return <main className="portfolio portfolio--status ui-render-fade" key="logged-out"><h1>Log in to view your collection</h1></main>;
  }

  return (
    <main className="portfolio ui-render-fade" key="collection">
      <header className="portfolio__header">
        <div>
          <span className="portfolio__eyebrow">Portfolio</span>
          <h1>My collection</h1>
        </div>
        <div className="portfolio__tools">
          <label className="portfolio__sort">
            <span>Sort</span>
            <select
              value={portfolioSort}
              onChange={(event) => setPortfolioSort(event.target.value as PortfolioSort)}
            >
              <option value="default">Default</option>
              <option value="price_desc">Price high to low</option>
              <option value="price_asc">Price low to high</option>
            </select>
          </label>
          <div className="portfolio__estimated-value">
            <div className="portfolio__estimated-value-row">
              <span>Price source</span>
              <div className="portfolio__estimated-value-options" aria-label="Estimated value source">
                <label>
                  <input
                    type="radio"
                    name="estimated-value-source"
                    checked={estimatedValueSource === "tcgplayer"}
                    onChange={() => setEstimatedValueSource("tcgplayer")}
                  />
                  TCGPlayer
                </label>
                <label>
                  <input
                    type="radio"
                    name="estimated-value-source"
                    checked={estimatedValueSource === "cardmarket"}
                    onChange={() => setEstimatedValueSource("cardmarket")}
                  />
                  Cardmarket
                </label>
              </div>
            </div>
            <div className="portfolio__estimated-value-row">
              <span>Estimated value</span>
              <strong>{estimatedCollectionValueLabel}</strong>
            </div>
            {missingPriceMessage && (
              <small className="portfolio__missing-price-data">{missingPriceMessage}</small>
            )}
          </div>
        </div>
      </header>

      {portfolio.length === 0 ? (
        <div className="portfolio__empty">
          <h2>No saved cards yet</h2>
          <p>Cards you add to your portfolio will appear here.</p>
        </div>
      ) : (
        <GridView>
          {sortedPortfolio.map((card) => (
            <div
              key={card.id}
              className={`portfolio__card${
                pendingQuantity?.cardId === card.id || pendingRemoval?.cardId === card.id
                  ? " portfolio__card--confirming"
                  : ""
              }`}
            >
              <PokemonCard
                card={card}
                priceSource={estimatedValueSource}
                quantity={card.quantity}
              />
              <div className="portfolio__card-actions ui-fade">
                <div className="portfolio__quantity-control">
                  <button
                    type="button"
                    className="portfolio__quantity-button"
                    aria-label={`Increase ${card.name} quantity`}
                    disabled={updatingQuantityId === card.id}
                    onClick={() => requestQuantityChange(card, 1)}
                  >
                    <ChevronUp aria-hidden="true" />
                  </button>
                </div>
                <div className="portfolio__quantity-display">
                  <input
                    className="portfolio__quantity"
                    aria-label={`${card.name} quantity`}
                    type="number"
                    min="1"
                    readOnly
                    value={pendingQuantity?.cardId === card.id
                      ? pendingQuantity.quantity
                      : card.quantity ?? 1}
                  />
                  {pendingQuantity?.cardId === card.id && (
                    <div
                      className="portfolio__quantity-confirm"
                      role="dialog"
                      aria-label="Confirm quantity change"
                    >
                      <button
                        type="button"
                        disabled={pendingQuantity.quantity === (card.quantity ?? 1)}
                        onClick={confirmQuantityChange}
                      >
                        Update
                      </button>
                      <button type="button" onClick={() => setPendingQuantity(null)}>Cancel</button>
                    </div>
                  )}
                </div>
                <div className="portfolio__quantity-control">
                  <button
                    type="button"
                    className="portfolio__quantity-button"
                    aria-label={`Decrease ${card.name} quantity`}
                    disabled={
                      (pendingQuantity?.cardId === card.id
                        ? pendingQuantity.quantity
                        : card.quantity ?? 1) <= 1 || updatingQuantityId === card.id
                    }
                    onClick={() => requestQuantityChange(card, -1)}
                  >
                    <ChevronDown aria-hidden="true" />
                  </button>
                </div>
                <div className="portfolio__remove-control">
                  <button
                    type="button"
                    className="portfolio__remove-card"
                    aria-label={`Remove ${card.name} from portfolio`}
                    title="Remove from portfolio"
                    onClick={() => setPendingRemoval({ cardId: card.id, cardName: card.name })}
                  >
                    <X aria-hidden="true" />
                  </button>
                  {pendingRemoval?.cardId === card.id && (
                    <div
                      className="portfolio__quantity-confirm"
                      role="dialog"
                      aria-label="Confirm card removal"
                    >
                      <span>Delete?</span>
                      <button type="button" onClick={confirmRemoval}>OK</button>
                      <button type="button" onClick={() => setPendingRemoval(null)}>Cancel</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </GridView>
      )}
    </main>
  );
}
