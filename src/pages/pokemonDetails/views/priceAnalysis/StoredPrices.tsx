import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Layers3,
  TriangleAlert,
} from "lucide-react";
import type { PokemonCard } from "../../../../types/pokemon";
import { formatDateStamp } from "../../../../utils/formatDateStamp";
import { getDefaultCardPriceOptionForSource } from "../../../../utils/pokemonPricing";
import "./StoredPrices.scss";

type FlatPriceField = { label: string; value: number | string };

function formatLabel(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function flatten(value: unknown, parent = ""): FlatPriceField[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, fieldValue]) => {
    const label = [parent, formatLabel(key)].filter(Boolean).join(" · ");
    return typeof fieldValue === "number" || typeof fieldValue === "string"
      ? [{ label, value: fieldValue }]
      : flatten(fieldValue, label);
  });
}

function formatPrice(value: number | string, currency: "USD" | "EUR") {
  return typeof value === "number"
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
      }).format(value)
    : value;
}

function hasNonZeroPrice(field: FlatPriceField) {
  if (typeof field.value === "number") return field.value !== 0;

  const numericValue = Number(field.value.trim().replace(",", "."));
  return !Number.isFinite(numericValue) || numericValue !== 0;
}

function getSafeSourceUrl(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function group(fields: FlatPriceField[], splitReverse = false) {
  const groups = Object.entries(
    fields.reduce<Record<string, FlatPriceField[]>>((result, field) => {
      const parts = field.label.split(" · ");
      const reverse = splitReverse && field.label.startsWith("Reverse Holo ");
      const name = reverse
        ? "Reverse Holo"
        : parts.length > 1
          ? (parts.shift() ?? "Prices")
          : "Prices";
      (result[name] ??= []).push({
        ...field,
        label: reverse
          ? field.label.replace(/^Reverse Holo /, "")
          : parts.join(" · ") || field.label,
      });
      return result;
    }, {}),
  );

  return groups.map(
    ([name, values]) =>
      [
        name,
        [...values].sort(
          (a, b) =>
            Number(/market|trend/i.test(b.label)) -
            Number(/market|trend/i.test(a.label)),
        ),
      ] as const,
  );
}

type SourceCardProps = {
  accent: "tcgplayer" | "cardmarket";
  title: string;
  region: string;
  url: string | null;
  heroPrice: string;
  heroLabel: string;
  groups: ReturnType<typeof group>;
  currency: "USD" | "EUR";
  highlight: RegExp;
  hasPrices: boolean;
  legend: { term: string; text: string }[];
  cardName: string;
  updatedAt?: string;
  showDetails: boolean;
  onToggleDetails: () => void;
  isPriceFlagged: boolean;
};

function SourceCard({
  accent,
  title,
  region,
  url,
  heroPrice,
  heroLabel,
  groups,
  currency,
  highlight,
  hasPrices,
  legend,
  cardName,
  updatedAt,
  showDetails,
  onToggleDetails,
  isPriceFlagged,
}: SourceCardProps) {
  return (
    <div className="stored-prices__source-block">
      <article
        className={`stored-prices__source stored-prices__source--${accent}`}
      >
        <header className="stored-prices__header">
          <div className="stored-prices__identity">
            <h3>{title}</h3>
            <div className="stored-prices__meta">
              <span className="stored-prices__region">{region}</span>
              {url && (
                <a
                  className="stored-prices__link"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Buy ${cardName} on ${title}`}
                >
                  Buy
                  <ExternalLink aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
          <div className="stored-prices__hero">
            <strong className="stored-prices__hero-price">{heroPrice}</strong>
            <span className="stored-prices__hero-label">{heroLabel}</span>
          </div>
        </header>

        {isPriceFlagged && (
          <div className="stored-prices__warning" role="status">
            <TriangleAlert aria-hidden="true" />
            <span>
              Potentially unstable price. Check the extended price data to verify.
            </span>
          </div>
        )}

        {showDetails && (
          <div className="stored-prices__details">
            {hasPrices ? (
              <div className="stored-prices__groups">
                {groups.map(([name, fields], groupIndex) => (
                  <section
                    className="stored-prices__group"
                    key={`${name}-${groupIndex}`}
                  >
                    <h4>
                      {name === "Prices" ? null : (
                        <>
                          <Layers3 aria-hidden="true" />
                          <span>{name}</span>
                        </>
                      )}
                    </h4>
                    {fields.map((field) => (
                      <div
                        className={`stored-prices__price${
                          highlight.test(field.label)
                            ? " stored-prices__price--highlight"
                            : ""
                        }`}
                        key={`${name}-${groupIndex}-${field.label}`}
                      >
                        <span>{field.label}</span>
                        <strong>{formatPrice(field.value, currency)}</strong>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            ) : (
              <div className="stored-prices__empty">
                <strong>Price data unavailable</strong>
                <span>
                  {title} did not return usable pricing for this card.
                </span>
              </div>
            )}

            <footer className="stored-prices__legend">
              {legend.map((item) => (
                <p key={item.term}>
                  <strong>{item.term}:</strong> {item.text}
                </p>
              ))}
            </footer>
          </div>
        )}
      </article>

      <div className="stored-prices__source-footer">
        <button
          className="stored-prices__details-toggle"
          type="button"
          aria-expanded={showDetails}
          onClick={onToggleDetails}
        >
          <span>{showDetails ? "Hide details" : "View details"}</span>
          {showDetails ? (
            <ChevronUp aria-hidden="true" />
          ) : (
            <ChevronDown aria-hidden="true" />
          )}
        </button>
        {updatedAt && (
          <p className="app-view-datestamp">{formatDateStamp(updatedAt)}</p>
        )}
      </div>
    </div>
  );
}

function fieldLeafName(label: string) {
  return label
    .split(" · ")
    .at(-1)
    ?.replace(/^(?:Reverse Holo|Holo) /, "");
}

export function StoredPrices({ card }: { card: PokemonCard }) {
  const [showDetails, setShowDetails] = useState(false);
  const tcgHidden = new Set(["Direct Low"]);
  const tcgFields = flatten(card.tcgplayer?.prices)
    .filter(hasNonZeroPrice)
    .filter((field) => {
      const name = fieldLeafName(field.label);
      return !name || !tcgHidden.has(name);
    });

  const cardmarketHidden = new Set([
    "Low Price",
    "Low",
    "German Pro Low",
    "Suggested Price",
    "Low Price Ex Plus",
    "Avg1",
  ]);
  const cardmarketFields = flatten(card.cardmarket?.prices)
    .filter(hasNonZeroPrice)
    .filter((field) => {
      const name = fieldLeafName(field.label);
      return !name || !cardmarketHidden.has(name);
    });

  const hasTcgplayerSource = Boolean(card.tcgplayer);
  const hasCardmarketSource = Boolean(card.cardmarket);
  if (!hasTcgplayerSource && !hasCardmarketSource) return null;

  const tcgGroups = group(tcgFields);
  const cardmarketGroups = group(cardmarketFields, true);
  const tcgDefaultPrice = getDefaultCardPriceOptionForSource(card, "tcgplayer");
  const cardmarketDefaultPrice = getDefaultCardPriceOptionForSource(
    card,
    "cardmarket",
  );
  const tcgplayerUrl = getSafeSourceUrl(card.tcgplayer?.url);
  const cardmarketUrl = getSafeSourceUrl(card.cardmarket?.url);

  return (
    <div className="stored-prices">
      <div className="stored-prices__grid">
        {hasTcgplayerSource && (
          <SourceCard
            accent="tcgplayer"
            title="TCGPlayer"
            region="US Market"
            url={tcgplayerUrl}
            heroPrice={
              tcgDefaultPrice ? formatPrice(tcgDefaultPrice.price, "USD") : "—"
            }
            heroLabel="Market Price"
            groups={tcgGroups}
            currency="USD"
            highlight={/market/i}
            hasPrices={tcgFields.length > 0}
            cardName={card.name}
            updatedAt={card.tcgplayer?.updatedAt}
            showDetails={showDetails}
            onToggleDetails={() => setShowDetails((current) => !current)}
            isPriceFlagged={card.priceReliability?.tcgplayer.isFlagged ?? false}
            legend={
              [
                // { term: "Low/Mid/High", text: "Current listing range (not sales)" },
              ]
            }
          />
        )}
        {hasCardmarketSource && (
          <SourceCard
            accent="cardmarket"
            title="Cardmarket"
            region="EU Market"
            url={cardmarketUrl}
            heroPrice={
              cardmarketDefaultPrice
                ? formatPrice(cardmarketDefaultPrice.price, "EUR")
                : "—"
            }
            heroLabel="Trend Price"
            groups={cardmarketGroups}
            currency="EUR"
            highlight={/trend/i}
            hasPrices={cardmarketFields.length > 0}
            cardName={card.name}
            updatedAt={card.cardmarket?.updatedAt}
            showDetails={showDetails}
            onToggleDetails={() => setShowDetails((current) => !current)}
            isPriceFlagged={
              card.priceReliability?.cardmarket.isFlagged ?? false
            }
            legend={
              [
                // { term: "Trend Price", text: "Algorithmic market value." },
              ]
            }
          />
        )}
      </div>
    </div>
  );
}
