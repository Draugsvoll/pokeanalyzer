import { useEffect, useId, useState, type ReactNode } from "react";
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  LockKeyhole,
} from "lucide-react";
import type { PokemonCard } from "../../../types/pokemon";
import type { PokeTraceMarket } from "../../../../shared/pokeTraceMarkets";
import {
  isEligibleGradedPrice,
  resolveGradedPrice,
} from "../../../../shared/gradedPrice";
import {
  fetchCardPriceHistory,
  fetchMarketPriceHistory,
  type CardPriceHistoryResponse,
  type MarketPriceHistoryResponse,
} from "../../../services/cardApi";
import { PriceChange } from "../../../components/priceChange/PriceChange";
import Button from "../../../components/button/Button";
import { RadioButtonGroup } from "../../../components/radioButtonGroup/RadioButtonGroup";
import { SelectDropdown } from "../../../components/selectDropdown/SelectDropdown";
import {
  isGradedHistoryTier,
  marketHistoryTierLabel,
  qualifyingGradedHistoryTiers,
  RAW_HISTORY_TIERS,
  type MarketHistoryTier,
} from "../../../../shared/pokeTraceHistoryTiers";
import { formatPriceChangePeriodLong } from "../../../../shared/priceChangePeriod";
import {
  MarketPriceHistoryChart,
  MarketPriceHistoryLoading,
} from "./MarketPriceHistoryChart";
import { MarketDataUnavailable } from "./MarketDataUnavailable";
import { CardmarketPriceRange } from "./CardmarketPriceRange";
import {
  resolveEbaySevenDayAverageChange,
  resolveSevenDayMarketPriceChange,
} from "./marketPriceChange";
import "./PokeTraceMarketPrices.scss";

type TierPrice = {
  avg?: number | null;
  median3d?: number | null;
  median7d?: number | null;
  median30d?: number | null;
  low?: number | null;
  high?: number | null;
  saleCount?: number | null;
  approxSaleCount?: boolean | null;
  avg7d?: number | null;
  avg30d?: number | null;
  lastUpdated?: string | null;
};

type MarketplacePrices = Record<string, TierPrice>;
const CONDITION_ORDER = [
  "MINT",
  "NEAR_MINT",
  "LIGHTLY_PLAYED",
  "MODERATELY_PLAYED",
  "HEAVILY_PLAYED",
  "DAMAGED",
];

const CONDITION_ABBREVIATIONS: Record<string, string> = {
  NEAR_MINT: "NM",
  LIGHTLY_PLAYED: "LP",
  MODERATELY_PLAYED: "MP",
  HEAVILY_PLAYED: "HP",
  DAMAGED: "DMG",
};

const money = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function sourceLabel(source: string) {
  if (source === "cardmarket") return "Cardmarket";
  return source.toLowerCase() === "tcgplayer" ? "TCGPlayer" : "Ebay";
}

function conditionLabel(condition: string) {
  return condition
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPrice(value: number | null | undefined, currency: string) {
  if (typeof value !== "number") return "—";

  const symbol =
    currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
  return `${symbol}${money.format(value)}`;
}

function sortedEntries(prices: MarketplacePrices) {
  return Object.entries(prices)
    .filter(
      ([condition]) =>
        condition !== "MINT" && CONDITION_ORDER.includes(condition),
    )
    .sort(([left], [right]) => {
      const leftIndex = CONDITION_ORDER.indexOf(left);
      const rightIndex = CONDITION_ORDER.indexOf(right);
      return leftIndex - rightIndex;
    });
}

function gradedEntries(prices?: MarketplacePrices) {
  if (!prices) return [];

  return Object.entries(prices)
    .filter(([condition]) => !CONDITION_ORDER.includes(condition))
    .filter(([, price]) => isEligibleGradedPrice(price))
    .sort(([left], [right]) =>
      conditionLabel(left).localeCompare(conditionLabel(right), "en-US", {
        numeric: true,
      }),
    );
}

function gradeLabel(grade: string) {
  const [grader, ...scoreParts] = grade.split("_");
  return {
    grader: grader || conditionLabel(grade),
    score: scoreParts.length > 0 ? scoreParts.join(".") : conditionLabel(grade),
  };
}

function formatSales(price: TierPrice) {
  if (typeof price.saleCount !== "number") return "—";
  return price.saleCount.toLocaleString("en-US");
}

function formatSalesLabel(price: TierPrice) {
  if (typeof price.saleCount !== "number") return "Sales unavailable";
  return `${formatSales(price)} ${price.saleCount === 1 ? "sale" : "sales"}`;
}

function MarketplaceColumn({
  currency,
  dataPending = false,
  dataRequestFailed = false,
  prices,
  priceHistory,
  source,
  url,
}: {
  currency: string;
  dataPending?: boolean;
  dataRequestFailed?: boolean;
  prices: MarketplacePrices;
  priceHistory: CardPriceHistoryResponse | null;
  source: string;
  url?: string;
}) {
  const aggregated = source === "cardmarket";
  const entries = aggregated
    ? Object.entries(prices).filter(([tier]) => tier === "AGGREGATED")
    : sortedEntries(prices);
  const defaultCondition = entries.some(
    ([condition]) => condition === "NEAR_MINT",
  )
    ? "NEAR_MINT"
    : (entries[0]?.[0] ?? "");
  const [selectedCondition, setSelectedCondition] = useState(defaultCondition);
  const activeCondition = entries.some(
    ([condition]) => condition === selectedCondition,
  )
    ? selectedCondition
    : defaultCondition;
  const selected =
    entries.find(([condition]) => condition === activeCondition) ?? entries[0];
  const [condition, price] = selected ?? ["", {}];
  const conditionGroup = useId();
  const sales = formatSales(price);
  const hasPrices = entries.length > 0;
  const showLoader = source.toLowerCase() === "ebay" && dataPending;
  const showEmptyState = !hasPrices && !dataPending && !dataRequestFailed;
  const showPrices = hasPrices && !showLoader;
  const displayedPrice = price.avg;
  const priceChange =
    source.toLowerCase() === "ebay" || aggregated
      ? resolveEbaySevenDayAverageChange(displayedPrice, price.avg7d)
      : resolveSevenDayMarketPriceChange(
          priceHistory,
          source,
          condition,
          displayedPrice,
          "avg",
        );
  const priceChangeTitle = `${formatPriceChangePeriodLong("7d")} ${sourceLabel(source)} ${conditionLabel(condition)} price change`;

  return (
    <article className="poketrace-market__marketplace default-container-inner">
      <div className="poketrace-market__source-heading">
        <h4
          className={`poketrace-market__source-title poketrace-market__source-title--${source.toLowerCase()}`}
        >
          {url ? (
            <a
              aria-label={`View on ${source.toLowerCase() === "tcgplayer" ? "TCG" : sourceLabel(source)}`}
              className={`app-link poketrace-market__market-link poketrace-market__market-link--${source.toLowerCase()}`}
              href={url}
              rel="noreferrer"
              target="_blank"
            >
              {sourceLabel(source)}
              <ExternalLink aria-hidden="true" />
            </a>
          ) : (
            sourceLabel(source)
          )}
        </h4>
        {aggregated ? (
          <span className="poketrace-market__aggregate-label">Listings</span>
        ) : (
          entries.length > 0 && (
            <div
              className={`poketrace-market__condition-tabs poketrace-market__condition-tabs--${source.toLowerCase()}`}
              role="radiogroup"
              aria-label={`${sourceLabel(source)} card condition`}
            >
              {entries.map(([candidate]) => (
                <label key={candidate} title={conditionLabel(candidate)}>
                  <input
                    checked={candidate === condition}
                    name={conditionGroup}
                    onChange={() => setSelectedCondition(candidate)}
                    type="radio"
                    value={candidate}
                  />
                  <span>
                    {CONDITION_ABBREVIATIONS[candidate] ??
                      conditionLabel(candidate)}
                  </span>
                </label>
              ))}
            </div>
          )
        )}
      </div>

      {showLoader && (
        <div
          aria-label={`Loading ${sourceLabel(source)} prices`}
          className="poketrace-market__marketplace-loading"
          role="status"
        >
          <span aria-hidden="true" className="app-loading-spinner" />
        </div>
      )}
      {showEmptyState && (
        <MarketDataUnavailable
          className="poketrace-market__marketplace-unavailable"
          description={`No recent ${sourceLabel(source)} prices were found.`}
          title="No price data"
        />
      )}
      {showPrices && (
        <div
          aria-live="polite"
          className="poketrace-market__condition-data ui-render-fade"
          key={condition}
        >
          <div className="poketrace-market__primary">
            <div className="poketrace-market__quote">
              <div className="poketrace-market__price-row">
                <div className="poketrace-market__price-summary">
                  <strong>{formatPrice(displayedPrice, currency)}</strong>
                  <PriceChange
                    key={`${source}:${condition}:${priceChange?.percent ?? "unavailable"}`}
                    percent={priceChange?.percent ?? null}
                    period="7d"
                    title={priceChangeTitle}
                    unavailableLabel={`${priceChangeTitle} unavailable`}
                  />
                </div>
              </div>
            </div>
          </div>

          {aggregated ? (
            <CardmarketPriceRange
              from={formatPrice(price.low, currency)}
              average30d={formatPrice(price.avg30d, currency)}
              trend={formatPrice(displayedPrice, currency)}
            />
          ) : (
            <dl className="poketrace-market__range">
              <div>
                <dt>Low</dt>
                <dd className="poketrace-market__range-price">
                  {formatPrice(price.low, currency)}
                </dd>
              </div>
              <div>
                <dt>High</dt>
                <dd className="poketrace-market__range-price">
                  {formatPrice(price.high, currency)}
                </dd>
              </div>
              <div>
                <dt>Sold</dt>
                <dd>{sales}</dd>
              </div>
            </dl>
          )}
        </div>
      )}
    </article>
  );
}

function GradedEbayPrices({
  currency,
  dataPending = false,
  dataRequestFailed = false,
  entries,
  locked = false,
  pricingHref,
  gradingCalculatorOpen = false,
  onToggleGradingCalculator,
}: {
  currency: string;
  dataPending?: boolean;
  dataRequestFailed?: boolean;
  entries: Array<[string, TierPrice]>;
  locked?: boolean;
  pricingHref: string;
  gradingCalculatorOpen?: boolean;
  onToggleGradingCalculator?: () => void;
}) {
  const groups = new Map<string, Array<[string, TierPrice]>>();
  for (const entry of entries) {
    const { grader } = gradeLabel(entry[0]);
    const group = groups.get(grader) ?? [];
    group.push(entry);
    groups.set(grader, group);
  }
  const graders = Array.from(groups.keys());
  const defaultGrader = graders.includes("PSA") ? "PSA" : (graders[0] ?? "");
  const [selectedGrader, setSelectedGrader] = useState(defaultGrader);
  const activeGrader = groups.has(selectedGrader)
    ? selectedGrader
    : defaultGrader;
  const visibleEntries = groups.get(activeGrader) ?? [];
  const hasPrices = entries.length > 0;
  const showLoader = dataPending;
  const showEmptyState = !hasPrices && !dataPending && !dataRequestFailed;
  const showPrices = hasPrices && !dataPending;

  return (
    <section
      aria-labelledby="poketrace-graded-title"
      className="poketrace-market__graded default-container-inner"
    >
      <fieldset className="poketrace-market__graded-controls" disabled={locked}>
        <header
          className={`poketrace-market__graded-header${showPrices ? " poketrace-market__graded-header--with-prices" : ""}`}
        >
          <h4 id="poketrace-graded-title">Graded</h4>
          {graders.length > 0 && (
            <RadioButtonGroup
              ariaLabel="Grading company"
              className="poketrace-market__grader-tabs"
              onChange={setSelectedGrader}
              options={(locked
                ? ([
                    ["ACE", 3],
                    ["BGS", 8],
                    ["CGC", 6],
                    ["PSA", 10],
                    ["TAG", 4],
                  ] as const)
                : graders.map(
                    (grader) =>
                      [grader, groups.get(grader)?.length ?? 0] as const,
                  )
              ).map(([grader, count]) => ({
                value: grader,
                label: (
                  <>
                    {grader}
                    <span
                      className="poketrace-market__grader-count"
                      title={`${count} graded prices`}
                    >
                      {count}
                    </span>
                  </>
                ),
              }))}
              value={activeGrader}
            />
          )}
        </header>
      </fieldset>
      {showLoader && (
        <div
          aria-label="Loading graded prices"
          className="poketrace-market__graded-loading"
          role="status"
        >
          <span aria-hidden="true" className="app-loading-spinner" />
        </div>
      )}
      {showEmptyState && (
        <MarketDataUnavailable
          className="poketrace-market__graded-unavailable"
          description="Graded sales have not been recorded for this card."
          title="No graded prices"
        />
      )}
      {showPrices && (
        <div className="poketrace-market__graded-body">
          <div
            className="poketrace-market__graded-grid ui-render-fade"
            key={activeGrader}
            aria-hidden={locked || undefined}
          >
            {visibleEntries.map(([grade, price]) => {
              const label = gradeLabel(grade);

              return (
                <div className="poketrace-market__graded-price" key={grade}>
                  <span>
                    {label.grader} {label.score}
                  </span>
                  <strong>
                    {formatPrice(resolveGradedPrice(price), currency)}
                  </strong>
                  <small>{formatSalesLabel(price)}</small>
                </div>
              );
            })}
          </div>
          {locked && <LockedContentOverlay pricingHref={pricingHref} />}
        </div>
      )}
      {onToggleGradingCalculator && (
        <div className="poketrace-market__calculator-toggle">
          <Button
            aria-controls="grading-calculator-title"
            aria-expanded={gradingCalculatorOpen}
            fill="ghost"
            fitContent
            onClick={onToggleGradingCalculator}
          >
            <Calculator aria-hidden="true" size={16} strokeWidth={2.25} />
            Grading Calculator
            {gradingCalculatorOpen ? (
              <ChevronUp aria-hidden="true" size={16} strokeWidth={2.25} />
            ) : (
              <ChevronDown aria-hidden="true" size={16} strokeWidth={2.25} />
            )}
          </Button>
        </div>
      )}
    </section>
  );
}

function ebayTierUpdatedOn(
  prices: Record<string, MarketplacePrices>,
  tier: MarketHistoryTier,
) {
  const lastUpdated = prices.ebay?.[tier]?.lastUpdated;
  if (typeof lastUpdated !== "string") return undefined;
  const day = lastUpdated.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
}

function PriceHistory({
  cardId,
  dataPending = false,
  data,
}: {
  cardId: string;
  dataPending?: boolean;
  data: NonNullable<PokemonCard["pokeTrace"]>;
}) {
  const [market, setMarket] = useState<PokeTraceMarket>("US");
  const [eligibilityTime] = useState(Date.now);
  const [selectedTier, setSelectedTier] = useState<MarketHistoryTier | null>(
    null,
  );
  const [histories, setHistories] = useState<
    Partial<Record<string, MarketPriceHistoryResponse>>
  >({});
  const [failedTiers, setFailedTiers] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [lastHistory, setLastHistory] =
    useState<MarketPriceHistoryResponse | null>(null);
  const usPrices = data.prices as Record<string, MarketplacePrices>;
  const tiers: MarketHistoryTier[] = [
    ...RAW_HISTORY_TIERS.filter((tier) => {
      if (tier === "MINT") return false;
      const prices = data.marketPrices?.[tier]?.[market];
      const sources =
        market === "US"
          ? [usPrices.tcgplayer?.[tier], usPrices.ebay?.[tier]]
          : [prices?.cardmarket_unsold];
      return sources.some(
        (price) =>
          typeof price?.avg === "number" &&
          Number.isFinite(price.avg) &&
          price.avg > 0,
      );
    }),
    ...qualifyingGradedHistoryTiers(
      data.marketPrices,
      market === "US" ? data.gradedOptions : undefined,
      eligibilityTime,
      market,
    ).sort((left, right) => {
      const [leftGrader, leftGrade] = left.split("_");
      const [rightGrader, rightGrade] = right.split("_");
      return (
        leftGrader.localeCompare(rightGrader, "en-US") ||
        Number(rightGrade) - Number(leftGrade)
      );
    }),
  ];
  const hasTiers = tiers.length > 0;
  const preferredTier =
    selectedTier ?? (tiers.includes("PSA_10") ? "PSA_10" : "NEAR_MINT");
  const tier = tiers.includes(preferredTier)
    ? preferredTier
    : tiers.includes("NEAR_MINT")
      ? "NEAR_MINT"
      : (tiers[0] ?? "NEAR_MINT");
  const historyKey = `${market}:${tier}`;
  const history = histories[historyKey];
  const historyFailed = failedTiers.has(historyKey);
  const label = marketHistoryTierLabel(tier);
  const marketControl = (
    <RadioButtonGroup<PokeTraceMarket>
      ariaLabel="Price history market"
      options={(["US", "EU"] as const).map((value) => ({
        value,
        label: value,
        disabled: data.markets?.[value]?.available !== true,
      }))}
      value={market}
      onChange={(value) => {
        setMarket(value);
        setSelectedTier("NEAR_MINT");
        setLastHistory(null);
        setFailedTiers(new Set());
      }}
    />
  );
  const conditionControl = hasTiers ? (
    <SelectDropdown<MarketHistoryTier>
      ariaLabel="Price history condition or grade"
      className="poketrace-market__history-period poketrace-market__history-tier"
      compact
      options={tiers.map((value) => ({
        value,
        label: marketHistoryTierLabel(value),
      }))}
      value={tier}
      onChange={(value) => {
        if (histories[`${market}:${value}`])
          setLastHistory(histories[`${market}:${value}`]!);
        setFailedTiers(new Set());
        setSelectedTier(value);
      }}
    />
  ) : (
    <span>No available conditions</span>
  );

  useEffect(() => {
    if (!cardId || !hasTiers || history !== undefined || historyFailed) return;

    const controller = new AbortController();
    void fetchMarketPriceHistory(cardId, controller.signal, tier, market)
      .then((result) => {
        if (!controller.signal.aborted) {
          if (
            result.cardId !== cardId ||
            result.condition !== tier ||
            result.market !== market
          ) {
            throw new Error("Price history does not match this card and tier");
          }
          setHistories((previous) => ({ ...previous, [historyKey]: result }));
          setLastHistory(result);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailedTiers((previous) => new Set(previous).add(historyKey));
        }
      });

    return () => controller.abort();
  }, [cardId, tier, history, historyFailed, market, historyKey, hasTiers]);

  const nearMintKey = `${market}:NEAR_MINT`;
  const nearMintHistory = histories[nearMintKey];
  const nearMintFailed = failedTiers.has(nearMintKey);
  const needsNearMint = isGradedHistoryTier(tier);
  useEffect(() => {
    if (
      !cardId ||
      !needsNearMint ||
      nearMintHistory !== undefined ||
      nearMintFailed
    )
      return;

    const controller = new AbortController();
    void fetchMarketPriceHistory(cardId, controller.signal, "NEAR_MINT", market)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (
          result.cardId !== cardId ||
          result.condition !== "NEAR_MINT" ||
          result.market !== market
        ) {
          throw new Error("Price history does not match this card and tier");
        }
        setHistories((previous) => ({ ...previous, [nearMintKey]: result }));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailedTiers((previous) => new Set(previous).add(nearMintKey));
        }
      });

    return () => controller.abort();
  }, [
    cardId,
    needsNearMint,
    nearMintHistory,
    nearMintFailed,
    market,
    nearMintKey,
  ]);

  const loading =
    dataPending ||
    !cardId ||
    (hasTiers && history === undefined && !historyFailed) ||
    (needsNearMint && nearMintHistory === undefined && !nearMintFailed);
  const displayedHistory = history ?? (loading ? lastHistory : null);
  const displayedTier = displayedHistory?.condition ?? tier;
  const displayingGrade = isGradedHistoryTier(displayedTier);
  const rawTier = displayingGrade ? "NEAR_MINT" : displayedTier;
  const rawHistory = displayingGrade ? nearMintHistory : displayedHistory;

  if (loading && !displayedHistory) {
    return (
      <MarketPriceHistoryLoading
        marketControl={marketControl}
        conditionControl={conditionControl}
        conditionLabel={label}
      />
    );
  }
  return (
    <MarketPriceHistoryChart
      marketControl={marketControl}
      conditionControl={conditionControl}
      conditionLabel={marketHistoryTierLabel(rawTier)}
      market={market}
      ebayUpdatedOn={
        market === "US"
          ? ebayTierUpdatedOn(
              data.prices as Record<string, MarketplacePrices>,
              rawTier,
            )
          : undefined
      }
      gradedHistory={
        displayingGrade && displayedHistory
          ? {
              label: marketHistoryTierLabel(displayedTier),
              points:
                displayedHistory.series[
                  market === "US" ? "ebay" : "cardmarket_unsold"
                ] ?? [],
              stale: displayedHistory.stale,
              updatedOn:
                market === "US"
                  ? ebayTierUpdatedOn(
                      data.prices as Record<string, MarketplacePrices>,
                      displayedTier,
                    )
                  : undefined,
            }
          : undefined
      }
      history={
        rawHistory ?? {
          currency:
            data.markets?.[market]?.currency ??
            (market === "US" ? "USD" : "EUR"),
          series: {},
          stale: false,
        }
      }
      loading={loading}
      gradeLoading={
        !dataPending &&
        history === undefined &&
        !historyFailed &&
        !!lastHistory &&
        lastHistory.condition !== tier &&
        isGradedHistoryTier(tier)
      }
    />
  );
}

const LOCKED_GRADED_PRICES: Array<[string, TierPrice]> = [
  ["PSA_1", { avg: 12, saleCount: 8 }],
  ["PSA_2", { avg: 18, saleCount: 12 }],
  ["PSA_3", { avg: 25, saleCount: 16 }],
  ["PSA_4", { avg: 30, saleCount: 20 }],
  ["PSA_5", { avg: 38, saleCount: 22 }],
  ["PSA_6", { avg: 45, saleCount: 24 }],
  ["PSA_7", { avg: 65, saleCount: 32 }],
  ["PSA_8", { avg: 95, saleCount: 48 }],
  ["PSA_9", { avg: 150, saleCount: 76 }],
  ["PSA_10", { avg: 320, saleCount: 54 }],
];

function LockedContentOverlay({ pricingHref }: { pricingHref: string }) {
  return (
    <div className="poketrace-market__locked-overlay">
      <span className="poketrace-market__locked-icon">
        <LockKeyhole aria-hidden="true" size={18} />
      </span>
      <p>Available with Basic or Pro membership.</p>
      <a href={pricingHref}>View pricing</a>
    </div>
  );
}

function LockedPriceHistory({
  currency,
  pricingHref,
}: {
  currency: string;
  pricingHref: string;
}) {
  const today = new Date();
  const points = (offset: number) =>
    Array.from({ length: 91 }, (_, index) => {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - 90 + index);
      return {
        date: date.toISOString().slice(0, 10),
        avg: 35 + offset + index * 0.15 + Math.sin(index / 7 + offset) * 4,
        median7d: null,
        median30d: null,
        low: null,
        high: null,
        saleCount: 5,
        approxSaleCount: null,
      };
    });
  return (
    <MarketPriceHistoryChart
      marketControl={
        <RadioButtonGroup
          ariaLabel="Price history market"
          options={[
            { value: "US", label: "US" },
            { value: "EU", label: "EU" },
          ]}
          value="US"
          onChange={() => {}}
        />
      }
      conditionControl={
        <SelectDropdown
          ariaLabel="Price history condition or grade"
          className="poketrace-market__history-period poketrace-market__history-tier"
          compact
          options={[{ value: "NEAR_MINT", label: "Near Mint" }]}
          value="NEAR_MINT"
          onChange={() => {}}
        />
      }
      history={{
        currency,
        series: { tcgplayer: points(0), ebay: points(5) },
        stale: false,
      }}
      chartOverlay={<LockedContentOverlay pricingHref={pricingHref} />}
    />
  );
}

function MarketContent({
  locked,
  children,
}: {
  locked: boolean;
  children: ReactNode;
}) {
  return (
    <div className="poketrace-market__access">
      <fieldset className="poketrace-market__access-content" disabled={locked}>
        {children}
      </fieldset>
    </div>
  );
}

export function PokeTraceMarketPrices({
  cardId,
  data,
  dataPending = false,
  dataRequestFailed = false,
  gradingCalculatorOpen = false,
  hasMarketHistoryAccess = false,
  marketHistoryAccessPending = false,
  pricingHref = "#membership-pricing",
  onToggleGradingCalculator,
  variantLoading = false,
}: {
  cardId: string;
  data: NonNullable<PokemonCard["pokeTrace"]>;
  dataPending?: boolean;
  dataRequestFailed?: boolean;
  gradingCalculatorOpen?: boolean;
  hasMarketHistoryAccess?: boolean;
  marketHistoryAccessPending?: boolean;
  pricingHref?: string;
  onToggleGradingCalculator?: () => void;
  variantLoading?: boolean;
}) {
  const prices = data.prices as Record<string, MarketplacePrices>;
  const urls = data.marketplaceUrls as Record<string, unknown>;
  const cardmarketProductId = /^eu_(\d+)$/.exec(
    data.markets?.EU?.cardId ?? "",
  )?.[1];
  const cardmarketUrl =
    typeof urls.cardmarket === "string" && urls.cardmarket
      ? urls.cardmarket
      : cardmarketProductId
        ? `https://www.cardmarket.com/en/Pokemon/Products?idProduct=${cardmarketProductId}`
        : undefined;
  const ebayGradedEntries = gradedEntries(prices.ebay);
  const sources = ["tcgplayer", "ebay"];
  const cardmarketPrice = data.marketPrices?.AGGREGATED?.EU?.cardmarket;
  const [priceHistory, setPriceHistory] =
    useState<CardPriceHistoryResponse | null>(null);

  useEffect(() => {
    setPriceHistory(null);
    if (!cardId) return;

    const controller = new AbortController();
    void fetchCardPriceHistory(cardId, 9, controller.signal)
      .then(setPriceHistory)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setPriceHistory(null);
      });

    return () => controller.abort();
  }, [cardId]);

  return (
    <section
      aria-busy={variantLoading}
      aria-label="Market prices"
      className="poketrace-market"
    >
      <div className="poketrace-market__grid">
        {sources.map((source) => (
          <MarketplaceColumn
            currency={data.currency}
            dataPending={dataPending}
            dataRequestFailed={dataRequestFailed}
            key={source}
            prices={prices[source] ?? {}}
            priceHistory={priceHistory}
            source={source}
            url={typeof urls[source] === "string" ? urls[source] : undefined}
          />
        ))}
        <MarketplaceColumn
          currency={data.markets?.EU?.currency ?? "EUR"}
          dataPending={dataPending}
          dataRequestFailed={dataRequestFailed}
          prices={cardmarketPrice ? { AGGREGATED: cardmarketPrice } : {}}
          priceHistory={null}
          source="cardmarket"
          url={cardmarketUrl}
        />
      </div>

      <MarketContent
        locked={!hasMarketHistoryAccess && !marketHistoryAccessPending}
      >
        {marketHistoryAccessPending ? (
          <MarketPriceHistoryLoading />
        ) : hasMarketHistoryAccess ? (
          <PriceHistory
            cardId={cardId}
            dataPending={dataPending}
            data={data}
            key={cardId}
          />
        ) : (
          <LockedPriceHistory
            currency={data.currency}
            pricingHref={pricingHref}
          />
        )}
      </MarketContent>
      <GradedEbayPrices
        currency={data.currency}
        dataPending={
          marketHistoryAccessPending || (hasMarketHistoryAccess && dataPending)
        }
        dataRequestFailed={hasMarketHistoryAccess && dataRequestFailed}
        entries={
          marketHistoryAccessPending
            ? []
            : hasMarketHistoryAccess
              ? ebayGradedEntries
              : LOCKED_GRADED_PRICES
        }
        locked={!hasMarketHistoryAccess && !marketHistoryAccessPending}
        pricingHref={pricingHref}
        gradingCalculatorOpen={gradingCalculatorOpen}
        onToggleGradingCalculator={onToggleGradingCalculator}
      />

      {variantLoading && (
        <div
          aria-label="Loading market data"
          className="poketrace-market__loading"
          role="status"
        >
          <span aria-hidden="true" className="app-loading-spinner" />
        </div>
      )}
    </section>
  );
}
