import { ExternalLink } from "lucide-react";
import type { PokemonCard } from "../../../../types/pokemon";

type FlatPriceField = { label: string; value: number | string };

function formatLabel(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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
    ? new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(value)
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
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function group(fields: FlatPriceField[], splitReverse = false) {
  const groups = Object.entries(fields.reduce<Record<string, FlatPriceField[]>>((result, field) => {
    const parts = field.label.split(" · ");
    const reverse = splitReverse && field.label.startsWith("Reverse Holo ");
    const name = reverse ? "Reverse Holo" : parts.length > 1 ? parts.shift() ?? "Prices" : "Prices";
    (result[name] ??= []).push({
      ...field,
      label: reverse ? field.label.replace(/^Reverse Holo /, "") : parts.join(" · ") || field.label,
    });
    return result;
  }, {}));

  return groups.map(([name, values]) => [name, [...values].sort((a, b) => Number(/market|trend/i.test(b.label)) - Number(/market|trend/i.test(a.label)))] as const);
}

export function StoredPrices({ card }: { card: PokemonCard }) {
  const tcgFields = flatten(card.tcgplayer?.prices).filter(hasNonZeroPrice);
  const hidden = new Set(["Low Price", "Low", "German Pro Low", "Suggested Price", "Low Price Ex Plus", "Avg1"]);
  const cardmarketFields = flatten(card.cardmarket?.prices).filter(hasNonZeroPrice).filter((field) => {
    const name = field.label.split(" · ").at(-1)?.replace(/^(?:Reverse Holo|Holo) /, "");
    return !name || !hidden.has(name);
  });
  const hasTcgplayerSource = Boolean(card.tcgplayer);
  const hasCardmarketSource = Boolean(card.cardmarket);
  if (!hasTcgplayerSource && !hasCardmarketSource) return null;

  const tcgGroups = group(tcgFields);
  const cardmarketGroups = group(cardmarketFields, true);
  const tcgMarket = tcgFields.find((field) => /market$/i.test(field.label));
  const cardmarketTrend = cardmarketFields.find((field) => /trend price$/i.test(field.label));
  const tcgplayerUrl = getSafeSourceUrl(card.tcgplayer?.url);
  const cardmarketUrl = getSafeSourceUrl(card.cardmarket?.url);

  const sourceDetails = (market: string, url: string | null, source: string) => (
    <div className="card-view__stored-price-source-details">
      <small>{market}</small>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${card.name} on ${source}`}
        >
          View source
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      )}
    </div>
  );

  const renderGroups = (groups: ReturnType<typeof group>, currency: "USD" | "EUR", highlight: RegExp) => (
    <div className="card-view__stored-price-groups">
      {groups.map(([name, fields]) => (
        <section key={name}>
          <h4>{name === "Prices" ? null : name}</h4>
          {fields.map((field) => (
            <div className={`card-view__stored-price${highlight.test(field.label) ? " card-view__stored-price--highlight" : ""}`} key={`${name}-${field.label}`}>
              <span>{field.label}</span><strong>{formatPrice(field.value, currency)}</strong>
            </div>
          ))}
        </section>
      ))}
    </div>
  );

  const unavailablePrices = (source: string) => (
    <div className="card-view__stored-price-unavailable">
      <strong>Price data unavailable</strong>
      <span>{source} did not return usable pricing for this card.</span>
    </div>
  );

  return (
    <div className="card-view__stored-prices">
      <div className="card-view__stored-price-sources">
        {hasTcgplayerSource && <section className="card-view__stored-price-source card-view__stored-price-source--tcgplayer">
          <div className="card-view__stored-price-source-header"><span className="card-view__stored-price-source-icon" aria-hidden="true">T</span><div><h3>TCGPlayer</h3>{sourceDetails("US Market", tcgplayerUrl, "TCGPlayer")}</div><div className="card-view__stored-price-summary"><strong>{tcgMarket ? formatPrice(tcgMarket.value, "USD") : "—"}</strong></div></div>
          {tcgFields.length > 0 ? renderGroups(tcgGroups, "USD", /market/i) : unavailablePrices("TCGPlayer")}
          <aside className="card-view__price-legend-source card-view__price-legend-source--tcgplayer"><div className="card-view__price-legend-header"></div><p><strong>Market Price:</strong> Average based on recent sales</p><p><strong>Low/Mid/High:</strong> Current listing range</p></aside>
        </section>}
        {hasCardmarketSource && <section className="card-view__stored-price-source card-view__stored-price-source--cardmarket">
          <div className="card-view__stored-price-source-header"><span className="card-view__stored-price-source-icon" aria-hidden="true">C</span><div><h3>Cardmarket</h3>{sourceDetails("EU Market", cardmarketUrl, "Cardmarket")}</div><div className="card-view__stored-price-summary"><strong>{cardmarketTrend ? formatPrice(cardmarketTrend.value, "EUR") : "—"}</strong></div></div>
          {cardmarketFields.length > 0 ? renderGroups(cardmarketGroups, "EUR", /trend/i) : unavailablePrices("Cardmarket")}
          <aside className="card-view__price-legend-source card-view__price-legend-source--cardmarket"><div className="card-view__price-legend-header"></div><p><strong>Trend Price:</strong> Algorithmic market value</p><p><strong>Average Sell Price:</strong> Low volume cards can have drastic price fluctuations.</p></aside>
        </section>}
      </div>

      {(card.tcgplayer?.updatedAt || card.cardmarket?.updatedAt) && <p className="card-view__stored-price-updated">Prices fluctuate quickly • Data updated {card.tcgplayer?.updatedAt ?? card.cardmarket?.updatedAt}</p>}
    </div>
  );
}
