import { Layers3 } from "lucide-react";
import { useState } from "react";
import { Badge } from "../../../../components/ui/Badge";
import { LoadingState } from "../../../../components/loadingState/LoadingState";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
import { parseJsonText } from "../../../../utils/parseJsonText";
import { FEATURE_ERROR_MESSAGE } from "../featureError";
import "./SalesDataView.scss";

type SalesDataViewProps = {
  cardName: string;
  grokRequest: GrokRequestState;
};

type MarketPrice = {
  grade: string;
  price: string;
  volume: string;
};

type SalesVariant = {
  marketPrices: MarketPrice[];
  notes: string[];
  title: string;
};

type RecentSale = {
  label: string;
  range: string;
};

type SalesData = {
  footer: string;
  recentSold: RecentSale[];
  variants: SalesVariant[];
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseMarketPrices(value: unknown): MarketPrice[] {
  return Array.isArray(value)
    ? value
        .filter(isRecord)
        .map((item) => ({
          grade: text(item.grade),
          price: text(item.price),
          volume: text(item.volume),
        }))
        .filter((item) => item.grade || item.price || item.volume)
    : [];
}

function parseNotes(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function parseSalesData(response: string): SalesData | null {
  const parsed = parseJsonText(response);
  if (!isRecord(parsed)) return null;

  const rawVariants = Array.isArray(parsed.variants) ? parsed.variants : [];

  const variants = rawVariants.length
    ? rawVariants
        .filter(isRecord)
        .map((variant, index) => {
          const variantTitle =
            text(variant.variant) ||
            text(variant.name) ||
            `Variant ${index + 1}`;

          return {
            marketPrices: parseMarketPrices(variant.market_prices),
            notes: parseNotes(variant.notes),
            title: variantTitle,
          };
        })
        .filter(
          (variant) =>
            variant.marketPrices.length > 0 || variant.notes.length > 0,
        )
    : [];

  const fallbackMarketPrices = parseMarketPrices(parsed.market_prices);
  const displayVariants =
    variants.length > 0
      ? variants
      : fallbackMarketPrices.length > 0
        ? [{ marketPrices: fallbackMarketPrices, notes: [], title: "" }]
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

  const data = {
    footer: text(parsed.footer),
    recentSold,
    variants: displayVariants,
  };

  const hasDisplayableContent =
    Boolean(data.footer) ||
    data.variants.length > 0 ||
    data.recentSold.length > 0;

  return hasDisplayableContent ? data : null;
}

function Notes({ notes }: { notes: string[] }) {
  return (
    <section className="sales-data-view__notes">
      <ul>
        {notes.map((note, index) => (
          <li className="default-note-container" key={`${note}-${index}`}>
            {note}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SalesDataView({ cardName, grokRequest }: SalesDataViewProps) {
  const { loading, error, response } = grokRequest;
  const responseKey = response ?? "";
  const [selectedVariant, setSelectedVariant] = useState({
    index: 0,
    responseKey: "",
  });

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
  const selectedVariantIndex =
    selectedVariant.responseKey === responseKey ? selectedVariant.index : 0;
  const activeVariantIndex = data.variants[selectedVariantIndex]
    ? selectedVariantIndex
    : 0;
  const activeVariant = data.variants[activeVariantIndex];

  return (
    <section className="sales-data-view ui-render-fade">
      {data.variants.length > 0 && (
        <section className="sales-data-view__panel sales-data-view__market default-container">
          <header className="sales-data-view__market-heading default-container-header">
            <h3 className="feature-section-heading">Graded Sales</h3>
            <p>
              Mostly eBay sales • <strong>PriceCharting</strong>
            </p>
          </header>
          <div className="sales-data-view__variants default-container-body">
            <fieldset
              aria-label="Graded sales variant"
              className="sales-data-view__variant-selector feature-variant-radio-group"
            >
              <div>
                {data.variants.map((variant, variantIndex) => (
                  <label key={`${variant.title}-${variantIndex}`}>
                    <input
                      checked={activeVariantIndex === variantIndex}
                      name="sales-volume-variant"
                      type="radio"
                      value={variantIndex}
                      onChange={() =>
                        setSelectedVariant({ index: variantIndex, responseKey })
                      }
                    />
                    <span>
                      <Layers3 aria-hidden="true" />
                      <strong>{variant.title || cardName}</strong>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {activeVariant && (
              <section
                className="sales-data-view__variant ui-render-fade"
                key={`${activeVariant.title}-${activeVariantIndex}`}
              >
                {activeVariant.marketPrices.length > 0 && (
                  <div className="sales-data-view__market-grid">
                    {activeVariant.marketPrices.map((market, index) => (
                      <article
                        className="default-container-inner"
                        key={`${market.grade}-${index}`}
                      >
                        <span>{market.grade || "Grade unavailable"}</span>
                        <strong>{market.price || "~"}</strong>
                        <Badge size="sm">{market.volume || "~"}</Badge>
                      </article>
                    ))}
                  </div>
                )}
                {activeVariant.notes.length > 0 && (
                  <Notes notes={activeVariant.notes} />
                )}
              </section>
            )}
          </div>
        </section>
      )}

      {data.recentSold.length > 0 && (
        <section className="sales-data-view__panel sales-data-view__recent default-container">
          <header>
            <h3>Recent Sold Examples</h3>
          </header>
          <div className="sales-data-view__sold-list">
            {data.recentSold.map((sale, index) => (
              <article
                className="default-container-inner"
                key={`${sale.label}-${index}`}
              >
                <span>{sale.label || "Sale range"}</span>
                <strong>{sale.range}</strong>
              </article>
            ))}
          </div>
        </section>
      )}

      {data.footer && <footer>{data.footer}</footer>}
    </section>
  );
}
