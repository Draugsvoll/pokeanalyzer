import { useId, type ReactNode } from "react";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import { formatPriceChangePeriodLong } from "../../../shared/priceChangePeriod";
import { CardIdentity } from "../cardIdentity/CardIdentity";
import { OverviewMetric, OverviewPanel } from "../overviewPanel/OverviewPanel";
import { PriceChange } from "../priceChange/PriceChange";
import { SegmentedRadioGroup } from "../ui/SegmentedRadioGroup";
import {
  formatAbsolutePriceChangePercent,
  priceChangeTone,
} from "../priceChange/priceChangeUtils";
import type { SetExplorerOverview as SetExplorerOverviewData } from "./setExplorerMetrics";
import type { SetCardScope } from "./setCardScope";
import "./SetExplorerOverview.scss";

type SetExplorerOverviewProps = {
  activeSetName: string;
  cardScope: SetCardScope;
  controls: ReactNode;
  onCardScopeChange: (scope: SetCardScope) => void;
  overview: SetExplorerOverviewData;
  updating: boolean;
};

const CARD_SCOPE_OPTIONS = [
  { label: "Unique", value: "unique" },
  { label: "All", value: "all" },
] as const;

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
  cardScope,
  controls,
  onCardScopeChange,
  overview,
  updating,
}: SetExplorerOverviewProps) {
  const revealRef = useScrollReveal<HTMLElement>();
  const cardScopeName = useId();
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

  return (
    <section
      aria-label={`${activeSetName} market overview`}
      aria-busy={updating || undefined}
      className="set-explorer-overview ui-scroll-reveal"
      ref={revealRef}
    >
      <header className="set-explorer-overview__header ui-render-fade">
        <div className="set-explorer-overview__identity">
          <h2 className="app-overview-value">{activeSetName}</h2>
          <p>
            {overview.totalCards.toLocaleString("en-US")} {cardLabel}{" "}
          </p>
        </div>
      </header>

      <OverviewPanel
        ariaLabel={`${activeSetName} summary`}
        className="set-explorer-overview__summary ui-render-fade"
        layout="three-featured"
      >
        <OverviewMetric
          className="set-explorer-overview__market"
          detail={
            <div className="set-explorer-overview__market-detail">
              <SegmentedRadioGroup
                ariaLabel="Cards included in set value"
                className="set-explorer-overview__card-scope"
                disabled={updating}
                name={cardScopeName}
                onChange={onCardScopeChange}
                options={CARD_SCOPE_OPTIONS}
                size="small"
                value={cardScope}
              />
              <span>
                {overview.pricedCards.toLocaleString("en-US")} of{" "}
                {overview.totalCards.toLocaleString("en-US")} {cardLabel} priced
              </span>
            </div>
          }
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
          valueClassName="set-explorer-overview__card-value"
        />

        {(
          [
            ["Most sold", overview.salesLeaders.total],
            ["Least sold", overview.salesLeaders.leastTotal],
          ] as const
        ).map(([label, leader]) => {
          const priceChange = leader?.percentChange ?? null;
          return (
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
                <>
                  <span>
                    {leader?.price != null
                      ? moneyFormatter(leader.currency).format(leader.price)
                      : "—"}
                  </span>
                  {priceChange != null && (
                    <PriceChange
                      ariaLabel={`${label} card ${changePeriodLong} price change ${formatAbsolutePriceChangePercent(priceChange)}`}
                      percent={priceChange}
                      period={overview.changePeriod}
                      title={`${changePeriodLong} price change`}
                    />
                  )}
                </>
              }
              valueClassName="set-explorer-overview__card-value"
            />
          );
        })}
      </OverviewPanel>

      {controls}
    </section>
  );
}
