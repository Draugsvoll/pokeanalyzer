import type { ReactNode } from "react";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import { formatPriceChangePeriodLong } from "../../../shared/priceChangePeriod";
import { CardIdentity } from "../cardIdentity/CardIdentity";
import { OverviewMetric, OverviewPanel } from "../overviewPanel/OverviewPanel";
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
  overview: SetExplorerOverviewData;
};

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

export function SetExplorerOverview({
  activeSetName,
  controls,
  overview,
}: SetExplorerOverviewProps) {
  const revealRef = useScrollReveal<HTMLElement>();
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
      className="set-explorer-overview ui-scroll-reveal"
      ref={revealRef}
    >
      <header className="set-explorer-overview__header ui-render-fade">
        <div className="set-explorer-overview__identity">
          <h2 className="app-overview-value">{activeSetName}</h2>
          <p>
            {overview.totalCards.toLocaleString("en-US")} {cardLabel}{" "}
            <span aria-hidden="true">·</span> TCGplayer market data
          </p>
        </div>
      </header>

      <OverviewPanel
        ariaLabel={`${activeSetName} summary`}
        className="set-explorer-overview__summary ui-render-fade"
      >
        <OverviewMetric
          className="set-explorer-overview__market"
          detail={`${overview.pricedCards.toLocaleString("en-US")} of ${overview.totalCards.toLocaleString("en-US")} ${cardLabel} priced`}
          label="Set value"
          value={
            <>
              <span>
                {overview.pricedCards > 0
                  ? money.format(overview.totalValue)
                  : "—"}
              </span>
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
            </>
          }
          valueClassName="set-explorer-overview__market-line"
        />

        <OverviewMetric
          className="set-explorer-overview__featured set-explorer-overview__valuable"
          detail={
            overview.topCard ? (
              <CardIdentity
                name={overview.topCard.card.name}
                number={overview.topCard.card.number}
              />
            ) : (
              "No priced cards"
            )
          }
          imageSrc={overview.topCard?.card.image}
          label="Most valuable"
          value={
            <>
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
            </>
          }
          valueClassName="set-explorer-overview__valuable-value"
        />

        {(
          [
            ["Most sold", overview.salesLeaders.total],
            ["Least sold", overview.salesLeaders.leastTotal],
          ] as const
        ).map(([label, leader]) => (
          <OverviewMetric
            className="set-explorer-overview__featured"
            detail={
              leader ? (
                <CardIdentity
                  name={leader.card.name}
                  number={leader.card.number}
                />
              ) : (
                "Sales data unavailable"
              )
            }
            imageSrc={leader?.card.image}
            key={label}
            label={label}
            value={
              <span
                aria-label={
                  leader
                    ? `${leader.approximate ? "Approximately " : ""}${integer.format(leader.sales)} sales`
                    : undefined
                }
              >
                {leader
                  ? `${leader.approximate ? "≈" : ""}${integer.format(leader.sales)}`
                  : "—"}
              </span>
            }
          />
        ))}
      </OverviewPanel>

      {controls}
    </section>
  );
}
