import { useEffect, useId, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { PokemonCard } from "../../../types/pokemon";
import {
  fetchMarketPriceHistory,
  type MarketPriceHistoryResponse,
} from "../../../services/cardApi";
import {
  MarketPriceHistoryChart,
  MarketPriceHistoryLoading,
} from "./MarketPriceHistoryChart";
import "./PokeTraceMarketPrices.scss";

type TierPrice = {
  avg?: number | null;
  low?: number | null;
  high?: number | null;
  saleCount?: number | null;
  approxSaleCount?: boolean | null;
};

type MarketplacePrices = Record<string, TierPrice>;
type VariantOption = { id: string; name: string };

const CONDITION_ORDER = [
  "MINT",
  "NEAR_MINT",
  "LIGHTLY_PLAYED",
  "MODERATELY_PLAYED",
  "HEAVILY_PLAYED",
  "DAMAGED",
];

const CONDITION_ABBREVIATIONS: Record<string, string> = {
  MINT: "M",
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
  return source.toLowerCase() === "tcgplayer" ? "TCGPlayer" : "eBay";
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
    .filter(([condition]) => CONDITION_ORDER.includes(condition))
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
  return price.saleCount.toLocaleString();
}

function formatSalesLabel(price: TierPrice) {
  if (typeof price.saleCount !== "number") return "Sales unavailable";
  return `${formatSales(price)} ${price.saleCount === 1 ? "sale" : "sales"}`;
}

function MarketplaceColumn({
  currency,
  prices,
  source,
  url,
}: {
  currency: string;
  prices: MarketplacePrices;
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
  const selected =
    entries.find(([condition]) => condition === selectedCondition) ??
    entries[0];
  const [condition, price] = selected ?? ["", {}];
  const conditionGroup = useId();
  const sales = formatSales(price);

  return (
    <article className="poketrace-market__marketplace default-container-inner">
      <div className="poketrace-market__source-heading">
        <h4
          className={`poketrace-market__source-title poketrace-market__source-title--${source.toLowerCase()}`}
        >
          {sourceLabel(source)}
        </h4>
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
      </div>

      <div
        aria-live="polite"
        className="poketrace-market__condition-data ui-render-fade"
        key={condition}
      >
        <div className="poketrace-market__primary">
          <div className="poketrace-market__quote">
            <div className="poketrace-market__price-row">
              <strong>{formatPrice(price.avg, currency)}</strong>
              {url && (
                <a
                  aria-label={`Buy on ${sourceLabel(source)}`}
                  className={`poketrace-market__market-link poketrace-market__market-link--${source.toLowerCase()}`}
                  href={url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Buy
                  <ExternalLink aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </div>

        <dl className="poketrace-market__range">
          <div>
            <dt>Low</dt>
            <dd>{formatPrice(price.low, currency)}</dd>
          </div>
          <div>
            <dt>High</dt>
            <dd>{formatPrice(price.high, currency)}</dd>
          </div>
          <div>
            <dt>Sales</dt>
            <dd>{sales}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

function GradedEbayPrices({
  currency,
  entries,
}: {
  currency: string;
  entries: Array<[string, TierPrice]>;
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
  const graderGroup = useId();

  if (entries.length === 0) return null;

  return (
    <section
      aria-labelledby="poketrace-graded-title"
      className="poketrace-market__graded default-container-inner"
    >
      <header className="poketrace-market__graded-header">
        <h3 id="poketrace-graded-title">Graded</h3>
        <div
          aria-label="Grading company"
          className="poketrace-market__condition-tabs poketrace-market__condition-tabs--graded poketrace-market__grader-tabs"
          role="radiogroup"
        >
          {graders.map((grader) => (
            <label key={grader}>
              <input
                checked={grader === activeGrader}
                name={graderGroup}
                onChange={() => setSelectedGrader(grader)}
                type="radio"
                value={grader}
              />
              <span>{grader}</span>
            </label>
          ))}
        </div>
      </header>
      <div
        className="poketrace-market__graded-grid ui-render-fade"
        key={activeGrader}
      >
        {visibleEntries.map(([grade, price]) => {
          const label = gradeLabel(grade);

          return (
            <div className="poketrace-market__graded-price" key={grade}>
              <span>
                {label.grader} {label.score}
              </span>
              <strong>{formatPrice(price.avg, currency)}</strong>
              <small>{formatSalesLabel(price)}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PriceHistory({ cardId }: { cardId: string }) {
  const [history, setHistory] = useState<MarketPriceHistoryResponse | null>(
    null,
  );
  const [unavailable, setUnavailable] = useState(false);
  const isDemo = cardId === "demo";

  useEffect(() => {
    if (isDemo) return;

    const controller = new AbortController();
    void fetchMarketPriceHistory(cardId, controller.signal)
      .then(setHistory)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setUnavailable(true);
      });

    return () => controller.abort();
  }, [cardId, isDemo]);

  if (isDemo) return null;
  if (!history && !unavailable) return <MarketPriceHistoryLoading />;
  if (history) return <MarketPriceHistoryChart history={history} />;
  return (
    <p className="poketrace-market__history-unavailable">
      Price history is temporarily unavailable.
    </p>
  );
}

export function PokeTraceMarketPrices({
  data,
  loadingVariantId,
  onVariantChange,
  selectedVariantId,
  variants,
}: {
  data: NonNullable<PokemonCard["pokeTrace"]>;
  loadingVariantId?: string | null;
  onVariantChange: (id: string) => void;
  selectedVariantId: string;
  variants: VariantOption[];
}) {
  const variantGroup = useId();
  const prices = data.prices as Record<string, MarketplacePrices>;
  const urls = data.marketplaceUrls as Record<string, unknown>;
  const ebayGradedEntries = gradedEntries(prices.ebay);
  const sources = ["tcgplayer", "ebay"].filter(
    (source) => prices[source] && sortedEntries(prices[source]).length > 0,
  );

  return (
    <section aria-label="Market prices" className="poketrace-market">
      <header className="poketrace-market__header">
        <div
          aria-label="Card variant"
          className="poketrace-market__condition-tabs poketrace-market__variant-tabs"
          role="radiogroup"
        >
          {variants.map((variant) => (
            <label key={variant.id}>
              <input
                checked={variant.id === selectedVariantId}
                disabled={Boolean(loadingVariantId)}
                name={variantGroup}
                onChange={() => onVariantChange(variant.id)}
                type="radio"
                value={variant.id}
              />
              <span>{conditionLabel(variant.name)}</span>
            </label>
          ))}
        </div>
      </header>

      <div className="poketrace-market__grid">
        {sources.map((source) => (
          <MarketplaceColumn
            currency={data.currency}
            key={source}
            prices={prices[source]}
            source={source}
            url={typeof urls[source] === "string" ? urls[source] : undefined}
          />
        ))}
      </div>

      <PriceHistory cardId={selectedVariantId} key={selectedVariantId} />

      <GradedEbayPrices currency={data.currency} entries={ebayGradedEntries} />
    </section>
  );
}
