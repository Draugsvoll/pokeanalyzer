import { useEffect, useId, useState, type ReactNode } from "react";
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  LockKeyhole,
} from "lucide-react";
import type { PokemonCard } from "../../../types/pokemon";
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
    .filter(
      ([, price]) =>
        !(
          typeof price.median3d === "number" &&
          Number.isFinite(price.median3d) &&
          price.median3d === price.median7d &&
          price.median7d === price.median30d
        ),
    )
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
  const entries = sortedEntries(prices);
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
    source.toLowerCase() === "ebay"
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
          {sourceLabel(source)}
        </h4>
        {entries.length > 0 && (
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
                {url && (
                  <a
                    aria-label={`View on ${source.toLowerCase() === "tcgplayer" ? "TCG" : sourceLabel(source)}`}
                    className={`poketrace-market__market-link poketrace-market__market-link--${source.toLowerCase()}`}
                    href={url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View on{" "}
                    {source.toLowerCase() === "tcgplayer"
                      ? "TCG"
                      : sourceLabel(source)}
                    <ExternalLink aria-hidden="true" />
                  </a>
                )}
              </div>
            </div>
          </div>

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
        <header className="poketrace-market__graded-header">
          <h3 id="poketrace-graded-title">Graded</h3>
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
                    {formatPrice(price.median7d ?? price.avg, currency)}
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
  const [selectedTier, setSelectedTier] =
    useState<MarketHistoryTier>("NEAR_MINT");
  const [histories, setHistories] = useState<
    Partial<Record<MarketHistoryTier, MarketPriceHistoryResponse>>
  >({});
  const [failedTiers, setFailedTiers] = useState<
    ReadonlySet<MarketHistoryTier>
  >(() => new Set());
  const [lastHistory, setLastHistory] =
    useState<MarketPriceHistoryResponse | null>(null);
  const tiers: MarketHistoryTier[] = [
    ...RAW_HISTORY_TIERS.filter((tier) => tier !== "MINT"),
    ...qualifyingGradedHistoryTiers(data.prices, data.gradedOptions).sort(
      (left, right) => {
        const [leftGrader, leftGrade] = left.split("_");
        const [rightGrader, rightGrade] = right.split("_");
        return (
          leftGrader.localeCompare(rightGrader, "en-US") ||
          Number(rightGrade) - Number(leftGrade)
        );
      },
    ),
  ];
  const tier = tiers.includes(selectedTier) ? selectedTier : "NEAR_MINT";
  const history = histories[tier];
  const historyFailed = failedTiers.has(tier);
  const label = marketHistoryTierLabel(tier);
  const conditionControl = (
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
        if (histories[value]) setLastHistory(histories[value]);
        setFailedTiers(new Set());
        setSelectedTier(value);
      }}
    />
  );

  useEffect(() => {
    if (!cardId || history !== undefined || historyFailed) return;

    const controller = new AbortController();
    void fetchMarketPriceHistory(cardId, controller.signal, tier)
      .then((result) => {
        if (!controller.signal.aborted) {
          if (result.cardId !== cardId || result.condition !== tier) {
            throw new Error("Price history does not match this card and tier");
          }
          setHistories((previous) => ({ ...previous, [tier]: result }));
          setLastHistory(result);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailedTiers((previous) => new Set(previous).add(tier));
        }
      });

    return () => controller.abort();
  }, [cardId, tier, history, historyFailed]);

  const nearMintHistory = histories.NEAR_MINT;
  const nearMintFailed = failedTiers.has("NEAR_MINT");
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
    void fetchMarketPriceHistory(cardId, controller.signal, "NEAR_MINT")
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.cardId !== cardId || result.condition !== "NEAR_MINT") {
          throw new Error("Price history does not match this card and tier");
        }
        setHistories((previous) => ({ ...previous, NEAR_MINT: result }));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailedTiers((previous) => new Set(previous).add("NEAR_MINT"));
        }
      });

    return () => controller.abort();
  }, [cardId, needsNearMint, nearMintHistory, nearMintFailed]);

  const loading =
    dataPending ||
    !cardId ||
    (history === undefined && !historyFailed) ||
    (needsNearMint && nearMintHistory === undefined && !nearMintFailed);
  const displayedHistory = history ?? (loading ? lastHistory : null);
  const displayedTier = displayedHistory?.condition ?? tier;
  const displayingGrade = isGradedHistoryTier(displayedTier);
  const rawTier = displayingGrade ? "NEAR_MINT" : displayedTier;
  const rawHistory = displayingGrade ? nearMintHistory : displayedHistory;

  if (loading && !displayedHistory) {
    return (
      <MarketPriceHistoryLoading
        conditionControl={conditionControl}
        conditionLabel={label}
      />
    );
  }
  return (
    <MarketPriceHistoryChart
      conditionControl={conditionControl}
      conditionLabel={marketHistoryTierLabel(rawTier)}
      ebayUpdatedOn={ebayTierUpdatedOn(
        data.prices as Record<string, MarketplacePrices>,
        rawTier,
      )}
      gradedHistory={
        displayingGrade && displayedHistory
          ? {
              label: marketHistoryTierLabel(displayedTier),
              points: displayedHistory.series.ebay ?? [],
              stale: displayedHistory.stale,
              updatedOn: ebayTierUpdatedOn(
                data.prices as Record<string, MarketplacePrices>,
                displayedTier,
              ),
            }
          : undefined
      }
      history={
        rawHistory ?? {
          currency: data.currency,
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
  pricingHref?: string;
  onToggleGradingCalculator?: () => void;
  variantLoading?: boolean;
}) {
  const prices = data.prices as Record<string, MarketplacePrices>;
  const urls = data.marketplaceUrls as Record<string, unknown>;
  const ebayGradedEntries = gradedEntries(prices.ebay);
  const sources = ["tcgplayer", "ebay"];
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
      </div>

      <MarketContent locked={!hasMarketHistoryAccess}>
        {hasMarketHistoryAccess ? (
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
        dataPending={hasMarketHistoryAccess && dataPending}
        dataRequestFailed={hasMarketHistoryAccess && dataRequestFailed}
        entries={
          hasMarketHistoryAccess ? ebayGradedEntries : LOCKED_GRADED_PRICES
        }
        locked={!hasMarketHistoryAccess}
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
