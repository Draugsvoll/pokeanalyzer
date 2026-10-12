import { useId, type ReactNode } from "react";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import { formatPriceChangePeriodLong } from "../../../shared/priceChangePeriod";
import { formatPokeTraceMoney } from "../../../shared/pokeTraceCurrency";
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
  releaseYear?: number;
  updating: boolean;
};

const CARD_SCOPE_OPTIONS = [
  { label: "Numbered", value: "unique" },
  { label: "All variants", value: "all" },
] as const;

type FeaturedMetricData =
  | NonNullable<SetExplorerOverviewData["mostValuable"]>
  | NonNullable<SetExplorerOverviewData["mostSold"]>;

type FeaturedCardMetricProps = {
  breakBefore?: boolean;
  changeAriaPrefix?: string;
  changePeriod: SetExplorerOverviewData["changePeriod"];
  changePeriodLong: string;
  data: FeaturedMetricData | null;
  label: string;
  unavailableLabel: string;
};

function FeaturedCardMetric({
  breakBefore = false,
  changeAriaPrefix = "",
  changePeriod,
  changePeriodLong,
  data,
  label,
  unavailableLabel,
}: FeaturedCardMetricProps) {
  const percentChange = data?.percentChange ?? null;
  const renderKey = [
    changePeriod,
    data?.card.id ?? "none",
    data?.price ?? "none",
    percentChange ?? "none",
  ].join(":");

  return (
    <OverviewMetric
      key={renderKey}
      breakBefore={breakBefore}
      detail={
        data ? (
          <CardIdentity name={data.card.name} number={data.card.number} />
        ) : (
          unavailableLabel
        )
      }
      imageSrc={data?.card.image}
      label={label}
      value={
        <>
          <span>
            {data?.price != null ? formatPokeTraceMoney(data.price) : "—"}
          </span>
          {percentChange != null && (
            <PriceChange
              ariaLabel={`${changeAriaPrefix}${changePeriodLong} price change ${formatAbsolutePriceChangePercent(percentChange)}`}
              percent={percentChange}
              period={changePeriod}
              title={`${changePeriodLong} price change`}
            />
          )}
        </>
      }
      valueClassName="set-explorer-overview__card-value"
    />
  );
}

export function SetExplorerOverview({
  activeSetName,
  cardScope,
  controls,
  onCardScopeChange,
  overview,
  releaseYear,
  updating,
}: SetExplorerOverviewProps) {
  const revealRef = useScrollReveal<HTMLElement>();
  const cardScopeName = useId();
  const changePeriodLong = formatPriceChangePeriodLong(overview.changePeriod);
  const tone =
    overview.movementPercent == null
      ? "flat"
      : priceChangeTone(overview.movementPercent);
  const formattedPercent =
    overview.movementPercent == null
      ? null
      : formatAbsolutePriceChangePercent(overview.movementPercent);
  const movementDirection =
    tone === "up" ? "Up" : tone === "down" ? "Down" : "Unchanged";
  const cardLabel = overview.totalCards === 1 ? "card" : "cards";
  const unpricedCards = Math.max(0, overview.totalCards - overview.pricedCards);
  const pricingCoverageLabel =
    unpricedCards > 0
      ? `${unpricedCards.toLocaleString("en-US")} ${unpricedCards === 1 ? "card has" : "cards have"} no price data`
      : null;

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
            {releaseYear != null && `${releaseYear} · `}
            {overview.totalCards.toLocaleString("en-US")} {cardLabel}{" "}
          </p>
        </div>
      </header>

      <OverviewPanel
        ariaLabel={`${activeSetName} summary`}
        className="set-explorer-overview__summary"
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
              {pricingCoverageLabel && <span>{pricingCoverageLabel}</span>}
            </div>
          }
          label="Set value"
          primary
          value={
            <>
              <span>
                {overview.pricedCards > 0
                  ? formatPokeTraceMoney(overview.totalValue)
                  : "—"}
              </span>
              <PriceChange
                animate
                ariaLabel={
                  overview.movementPercent == null
                    ? undefined
                    : `${movementDirection} by ${formattedPercent}. ${changePeriodLong} Near Mint movement`
                }
                percent={overview.movementPercent}
                period={overview.changePeriod}
                title={`${changePeriodLong} Near Mint movement`}
                unavailableLabel={`${changePeriodLong} Near Mint movement is not available`}
              />
            </>
          }
          valueClassName="set-explorer-overview__market-line"
        />

        <OverviewMetric
          detail={
            <>
              {overview.uniqueCards.toLocaleString("en-US")} numbered
              <br />
              {overview.variantCards.toLocaleString("en-US")} variants &
              treatment
            </>
          }
          label="Cards"
          size="compact"
          value={overview.uniqueCards.toLocaleString("en-US")}
        />

        <FeaturedCardMetric
          changePeriod={overview.changePeriod}
          changePeriodLong={changePeriodLong}
          data={overview.bestPerformer}
          label="Best performer"
          unavailableLabel="Price change unavailable"
        />

        <FeaturedCardMetric
          breakBefore
          changePeriod={overview.changePeriod}
          changePeriodLong={changePeriodLong}
          data={overview.mostValuable}
          label="Most valuable"
          unavailableLabel="No priced cards"
        />

        <FeaturedCardMetric
          changeAriaPrefix="Most sold card "
          changePeriod={overview.changePeriod}
          changePeriodLong={changePeriodLong}
          data={overview.mostSold}
          label="Most sold"
          unavailableLabel="Sales data unavailable"
        />
      </OverviewPanel>

      {controls}
    </section>
  );
}
