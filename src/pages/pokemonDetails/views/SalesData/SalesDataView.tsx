import { LoadingState } from "../../../../components/loadingState/LoadingState";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
import { parseJsonText } from "../../../../utils/parseJsonText";
import { FEATURE_ERROR_MESSAGE } from "../featureError";
import "./SalesDataView.scss";

type SalesDataViewProps = {
  grokRequest: GrokRequestState;
};

type MarketPrice = {
  grade: string;
  price: string;
  volume: string;
};

type RecentSale = {
  label: string;
  range: string;
};

type SalesData = {
  footer: string;
  marketPrices: MarketPrice[];
  notes: string[];
  recentSold: RecentSale[];
  subtitle: string;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseSalesData(response: string): SalesData | null {
  const parsed = parseJsonText(response);
  if (!isRecord(parsed)) return null;

  const marketPrices = Array.isArray(parsed.market_prices)
    ? parsed.market_prices
        .filter(isRecord)
        .map((item) => ({
          grade: text(item.grade),
          price: text(item.price),
          volume: text(item.volume),
        }))
        .filter((item) => item.grade || item.price || item.volume)
    : [];
  const recentSold = Array.isArray(parsed.recent_sold)
    ? parsed.recent_sold
        .filter(isRecord)
        .map((item) => ({
          label: text(item.label),
          range: text(item.range),
        }))
        .filter((item) => item.label || item.range)
    : [];
  const notes = Array.isArray(parsed.notes)
    ? parsed.notes.map(text).filter(Boolean)
    : [];

  const data = {
    footer: text(parsed.footer),
    marketPrices,
    notes,
    recentSold,
    subtitle: "PriceCharting",
  };

  const hasDisplayableContent =
    Boolean(data.footer) ||
    data.marketPrices.length > 0 ||
    data.recentSold.length > 0 ||
    data.notes.length > 0;

  return hasDisplayableContent ? data : null;
}

function Notes({
  notes,
  standalone = false,
}: {
  notes: string[];
  standalone?: boolean;
}) {
  return (
    <section
      className={`sales-data-view__notes${standalone ? " sales-data-view__notes--standalone sales-data-view__panel" : ""}`}
    >
      <ul>
        {notes.map((note, index) => (
          <li key={`${note}-${index}`}>{note}</li>
        ))}
      </ul>
    </section>
  );
}

export function SalesDataView({ grokRequest }: SalesDataViewProps) {
  const { loading, error, response } = grokRequest;

  if (loading) return <LoadingState>Researching sales data...</LoadingState>;
  if (error)
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  if (!response) return null;

  const data = parseSalesData(response);
  if (!data) {
    return (
      <p className="card-view__page-error" role="alert">
        {FEATURE_ERROR_MESSAGE}
      </p>
    );
  }

  return (
    <section className="sales-data-view ui-render-fade">
      {data.marketPrices.length > 0 && (
        <section className="sales-data-view__panel sales-data-view__market">
          <header className="sales-data-view__market-heading">
            <div>
              <h3>Sales Volume</h3>
              <p>{data.subtitle}</p>
            </div>
          </header>
          <div className="sales-data-view__market-grid">
            {data.marketPrices.map((market, index) => (
              <article key={`${market.grade}-${index}`}>
                <span>{market.grade || "Grade unavailable"}</span>
                <strong>{market.price || "~"}</strong>
                <small className="sales-data-view__volume-badge">
                  {market.volume || "~"}
                </small>
              </article>
            ))}
          </div>
          {data.notes.length > 0 && <Notes notes={data.notes} />}
        </section>
      )}

      {data.recentSold.length > 0 && (
        <section className="sales-data-view__panel sales-data-view__recent">
          <header>
            <h3>Recent Sold Examples</h3>
          </header>
          <div className="sales-data-view__sold-list">
            {data.recentSold.map((sale, index) => (
              <article key={`${sale.label}-${index}`}>
                <span>{sale.label || "Sale range"}</span>
                <strong>{sale.range}</strong>
              </article>
            ))}
          </div>
        </section>
      )}

      {data.notes.length > 0 && data.marketPrices.length === 0 && (
        <Notes notes={data.notes} standalone />
      )}

      {data.footer && <footer>{data.footer}</footer>}
    </section>
  );
}
