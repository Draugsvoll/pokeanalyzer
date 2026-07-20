import { ChartLine, ExternalLink, Globe2, Search, Store } from "lucide-react";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
import { parseJsonText } from "../../../../utils/parseJsonText";
import type { PokemonCard } from "../../../../types/pokemon";
import { JustTcgVariants } from "./JustTcgVariants/JustTcgVariants";
import { StoredPrices } from "./StoredPrices";
import { LoadingState } from "../../../../components/loadingState/LoadingState";
import "./PriceAnalysis.scss";

type PriceAnalysisProps = {
  card: PokemonCard;
  grokRequest: GrokRequestState;
  justTcgRequest: {
    loading: boolean;
    error: string;
    response: unknown;
  };
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatAmount(amount: number, currency: string | null): string {
  if (!currency) return amount.toLocaleString();

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency}`;
  }
}

function getMoney(value: unknown): { amount: string; condition: string | null } | null {
  if (!isRecord(value)) return null;

  const amount = number(value.value);
  if (amount === null) return null;

  const currency = text(value.currency);
  const condition = text(value.condition);
  return { amount: formatAmount(amount, currency), condition };
}

function PriceField({ label, value }: { label: string; value: unknown }) {
  const money = getMoney(value);
  if (!money) return null;

  return (
    <div className="grok-price-analysis__price">
      <span>{label}</span>
      <strong>{money.amount}</strong>
      {money.condition && <small>{money.condition}</small>}
    </div>
  );
}

function GrokPriceAnalysis({ grokRequest }: Pick<PriceAnalysisProps, "grokRequest">) {
  const { loading, error, response } = grokRequest;

  if (loading) return <LoadingState>Asking Grok...</LoadingState>;
  if (error) return <p className="card-view__page-error">{error}</p>;
  if (!response) return null;

  const parsed = parseJsonText(response);
  if (!isRecord(parsed)) return <p>{response}</p>;

  const marketData = Array.isArray(parsed.market_data)
    ? parsed.market_data.filter(isRecord)
    : [];
  const currencyReference = isRecord(parsed.currency_reference)
    ? parsed.currency_reference
    : null;
  return (
    <section className="grok-price-analysis ui-render-fade">
      {marketData.length > 0 && (
        <div>
          <h2 className="app-subheader">Other market sources</h2>
          <div className="grok-price-analysis__markets">
          {marketData.map((market, index) => {
            const source = text(market.source);
            const region = text(market.region);
            const notes = text(market.notes);
            const url = text(market.url);
            const recentSales = isRecord(market.recent_near_mint_sales)
              ? market.recent_near_mint_sales
              : null;
            const range = recentSales && isRecord(recentSales.range)
              ? recentSales.range
              : null;
            const sales = recentSales && Array.isArray(recentSales.sales)
              ? recentSales.sales.filter((sale): sale is number => number(sale) !== null)
              : [];
            const salesCurrency = recentSales ? text(recentSales.currency) : null;
            const rangeMin = range ? number(range.min) : null;
            const rangeMax = range ? number(range.max) : null;
            const sourceKey = source?.toLowerCase() ?? "";
            const tone = sourceKey.includes("tcgplayer")
              ? "orange"
              : sourceKey.includes("cardmarket")
                ? "green"
                : sourceKey.includes("pricecharting")
                  ? "violet"
                  : "blue";
            const SourceIcon = sourceKey.includes("tcgplayer")
              ? Store
              : sourceKey.includes("cardmarket")
                ? Globe2
                : sourceKey.includes("pricecharting")
                  ? ChartLine
                  : Search;

            return (
              <article className={`grok-price-analysis__market grok-price-analysis__market--${tone}`} key={`${source ?? "source"}-${index}`}>
                {(source || region) && (
                  <div className="grok-price-analysis__source">
                    <span><SourceIcon aria-hidden="true" /></span>
                    <div>
                      {source && <h3>{source}</h3>}
                      {region && <small>{region}</small>}
                    </div>
                  </div>
                )}

                <div className="grok-price-analysis__price-details">
                  <div className="grok-price-analysis__prices">
                    <PriceField label="Market price" value={market.market_price} />
                    <PriceField label="Lowest listing" value={market.lowest_listing} />
                    <PriceField label="Most recent sale" value={market.most_recent_sale} />
                    <PriceField label="Near Mint listing" value={market.near_mint_listing} />
                    <PriceField label="Excellent listing" value={market.excellent_listing} />
                    <PriceField label="Lowest playable listing" value={market.lowest_playable_listing} />
                  </div>

                  {rangeMin !== null && rangeMax !== null && (
                    <div className="grok-price-analysis__range">
                      <span>Recent Near Mint sales range</span>
                      <strong>{formatAmount(rangeMin, salesCurrency)} – {formatAmount(rangeMax, salesCurrency)}</strong>
                    </div>
                  )}

                  {sales.length > 0 && (
                    <div className="grok-price-analysis__sales">
                      <span>Recent sales</span>
                      <div>{sales.map((sale, saleIndex) => (
                        <strong key={`${sale}-${saleIndex}`}>{formatAmount(sale, salesCurrency)}</strong>
                      ))}</div>
                    </div>
                  )}
                </div>

                {notes && <p className="grok-price-analysis__notes">{notes}</p>}
                {url && <a href={url} target="_blank" rel="noreferrer">View on {source ?? "source"}<ExternalLink aria-hidden="true" /></a>}
              </article>
            );
          })}
          </div>
        </div>
      )}

      {(text(parsed.last_updated) || currencyReference) && (
        <footer className="grok-price-analysis__footer">
          {text(parsed.last_updated) && <span>Last updated: {text(parsed.last_updated)}</span>}
          {currencyReference && [text(currencyReference.primary), text(currencyReference.secondary)].some(Boolean) && (
            <span>
              Currencies: {[text(currencyReference.primary), text(currencyReference.secondary)]
                .filter(Boolean)
                .join(" / ")}
            </span>
          )}
        </footer>
      )}
    </section>
  );
}

function JustTcgPriceAnalysis({
  justTcgRequest,
}: Pick<PriceAnalysisProps, "justTcgRequest">) {
  if (justTcgRequest.loading) {
    return <LoadingState>Fetching JustTCG prices...</LoadingState>;
  }

  return (
    <>
      {justTcgRequest.error && (
        <p className="card-view__page-error">{justTcgRequest.error}</p>
      )}
      {justTcgRequest.response !== null && (
        <JustTcgVariants response={justTcgRequest.response} />
      )}
    </>
  );
}

export function PriceAnalysis({
  card,
  grokRequest,
  justTcgRequest,
}: PriceAnalysisProps) {
  return (
    <>
      <StoredPrices card={card} />
      <JustTcgPriceAnalysis justTcgRequest={justTcgRequest} />
      <GrokPriceAnalysis grokRequest={grokRequest} />
    </>
  );
}
