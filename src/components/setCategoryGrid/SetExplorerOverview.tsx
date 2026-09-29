import type { ReactNode } from "react";
import type { PokemonCard } from "../../types/pokemon";
import { formatPriceChangePeriodLong } from "../../../shared/priceChangePeriod";
import { CardIdentity } from "../cardIdentity/CardIdentity";
import { PriceChange } from "../priceChange/PriceChange";
import {
  formatAbsolutePriceChangePercent,
  priceChangeTone,
} from "../priceChange/priceChangeUtils";
import type { SetExplorerOverview as SetExplorerOverviewData } from "./setExplorerMetrics";
import "./SetExplorerOverview.scss";

type SetExplorerOverviewProps = {
  activeSetName: string;
  controls: ReactNode;
  onFilterCard: (card: PokemonCard) => void;
  overview: SetExplorerOverviewData;
};

type OverviewFeatureProps = {
  card: PokemonCard | null;
  children: ReactNode;
  className?: string;
  label: string;
  onFilterCard: (card: PokemonCard) => void;
};

function OverviewFeature({
  card,
  children,
  className = "",
  label,
  onFilterCard,
}: OverviewFeatureProps) {
  const classes = `set-explorer-overview__featured${className ? ` ${className}` : ""}`;
  if (!card) return <div className={classes}>{children}</div>;

  const cardIdentity = [card.name, card.number].filter(Boolean).join(" ");
  return (
    <button
      aria-label={`${label}: filter cards to ${cardIdentity}`}
      className={classes}
      onClick={() => onFilterCard(card)}
      title={`Show ${cardIdentity}`}
      type="button"
    >
      {children}
    </button>
  );
}

function moneyFormatter(currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      style: "currency",
    });
  } catch {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  }
}

function OverviewCardImage({ card }: { card: PokemonCard }) {
  if (!card.image) return null;
  return (
    <img
      alt=""
      loading="lazy"
      onError={(event) => {
        event.currentTarget.hidden = true;
      }}
      src={card.image}
    />
  );
}

export function SetExplorerOverview({
  activeSetName,
  controls,
  onFilterCard,
  overview,
}: SetExplorerOverviewProps) {
  const money = moneyFormatter(overview.currency);
  const changePeriodLong = formatPriceChangePeriodLong(overview.changePeriod);
  const tone =
    overview.movementPercent == null
      ? "flat"
      : priceChangeTone(overview.movementPercent);
  const formattedPercent =
    overview.movementPercent == null
      ? null
      : formatAbsolutePriceChangePercent(overview.movementPercent);
  const topCardChange = overview.topCard?.percentChange ?? null;
  const movementDirection =
    tone === "up" ? "Up" : tone === "down" ? "Down" : "Unchanged";
  const cardLabel = overview.totalCards === 1 ? "card" : "cards";
  const integer = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  });

  return (
    <section
      aria-label={`${activeSetName} market overview`}
      className="set-explorer-overview ui-render-fade"
    >
      <header className="set-explorer-overview__header">
        <div className="set-explorer-overview__identity">
          <h2 className="app-overview-value">{activeSetName}</h2>
          <p>
            {overview.totalCards.toLocaleString("en-US")} {cardLabel}{" "}
            <span aria-hidden="true">·</span> TCGplayer market data
          </p>
        </div>
      </header>

      <div className="set-explorer-overview__summary">
        <div className="set-explorer-overview__market">
          <span>Set value</span>
          <div className="set-explorer-overview__market-line">
            <strong className="app-overview-value">
              {overview.pricedCards > 0
                ? money.format(overview.totalValue)
                : "—"}
            </strong>
            <span
              aria-label={
                overview.movementPercent == null
                  ? `${changePeriodLong} Near Mint movement is not available`
                  : undefined
              }
              className="set-explorer-overview__market-movement"
              title={
                overview.movementPercent == null
                  ? `${changePeriodLong} Near Mint movement`
                  : undefined
              }
            >
              {overview.movementPercent == null ? (
                <em>Building history</em>
              ) : (
                <PriceChange
                  animate
                  ariaLabel={`${movementDirection} by ${formattedPercent}. ${changePeriodLong} Near Mint movement`}
                  percent={overview.movementPercent}
                  period={overview.changePeriod}
                  title={`${changePeriodLong} Near Mint movement`}
                />
              )}
            </span>
          </div>
          <small>
            {overview.pricedCards.toLocaleString("en-US")} of{" "}
            {overview.totalCards.toLocaleString("en-US")} {cardLabel} priced
          </small>
        </div>

        <OverviewFeature
          card={overview.topCard?.card ?? null}
          className="set-explorer-overview__valuable"
          label="Most valuable"
          onFilterCard={onFilterCard}
        >
          <span className="set-explorer-overview__featured-content">
            <span>Most valuable</span>
            <strong className="app-overview-value set-explorer-overview__valuable-value">
              <span>
                {overview.topCard ? money.format(overview.topCard.price) : "—"}
              </span>
              {topCardChange != null && (
                <PriceChange
                  ariaLabel={`${changePeriodLong} price change ${formatAbsolutePriceChangePercent(topCardChange)}`}
                  percent={topCardChange}
                  period={overview.changePeriod}
                  title={`${changePeriodLong} price change`}
                />
              )}
            </strong>
            <small>
              {overview.topCard ? (
                <CardIdentity
                  name={overview.topCard.card.name}
                  number={overview.topCard.card.number}
                />
              ) : (
                "No priced cards"
              )}
            </small>
          </span>
          {overview.topCard && (
            <OverviewCardImage card={overview.topCard.card} />
          )}
        </OverviewFeature>

        {(
          [
            ["Most sold", overview.salesLeaders.total],
            ["Least sold", overview.salesLeaders.leastTotal],
          ] as const
        ).map(([label, leader]) => (
          <OverviewFeature
            card={leader?.card ?? null}
            key={label}
            label={label}
            onFilterCard={onFilterCard}
          >
            <span className="set-explorer-overview__featured-content">
              <span>{label}</span>
              <strong
                aria-label={
                  leader
                    ? `${leader.approximate ? "Approximately " : ""}${integer.format(leader.sales)} sales`
                    : undefined
                }
                className="app-overview-value set-explorer-overview__sales-value"
              >
                {leader
                  ? `${leader.approximate ? "≈" : ""}${integer.format(leader.sales)}`
                  : "—"}
              </strong>
              <small>
                {leader ? (
                  <CardIdentity
                    name={leader.card.name}
                    number={leader.card.number}
                  />
                ) : (
                  "Sales data unavailable"
                )}
              </small>
            </span>
            {leader && <OverviewCardImage card={leader.card} />}
          </OverviewFeature>
        ))}
      </div>

      {controls}
    </section>
  );
}
