import { Layers3 } from "lucide-react";
import "./JustTcgVariants.scss";

type JsonRecord = Record<string, unknown>;

type JustTcgVariant = {
  id: string;
  condition: string;
  printing: string;
  price?: number;
  allTimeHigh?: number;
  allTimeHighDate?: string;
  allTimeLow?: number;
  allTimeLowDate?: string;
};

type JustTcgVariantGroup = {
  id: string;
  pokemonName: string;
  cardNumber: string;
  printing: string;
  setName: string;
  variants: JustTcgVariant[];
};

type JustTcgVariantsProps = {
  response: unknown;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalDateString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) {
    // Epoch seconds vs milliseconds
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return undefined;
}

/** Subtle stamp: "12 Mar 2024" */
function formatPriceStamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function parseVariantGroups(response: unknown): JustTcgVariantGroup[] {
  if (!isRecord(response) || !Array.isArray(response.data)) return [];

  return response.data.flatMap((card, cardIndex) => {
    if (!isRecord(card) || !Array.isArray(card.variants)) return [];

    const cardId = String(card.id ?? cardIndex);
    const pokemonName =
      typeof card.name === "string" && card.name
        ? card.name
        : "Unknown card";
    const setName =
      typeof card.set_name === "string" && card.set_name
        ? card.set_name
        : "Unknown set";
    const cardNumber =
      typeof card.number === "string" && card.number.trim()
        ? card.number.trim()
        : typeof card.number === "number" && Number.isFinite(card.number)
          ? String(card.number)
          : "";
    const variants = card.variants
      .filter(isRecord)
      .map((variant, variantIndex) => ({
        id:
          typeof variant.id === "string"
            ? variant.id
            : `${String(card.id ?? cardIndex)}-${variantIndex}`,
        condition:
          typeof variant.condition === "string" && variant.condition
            ? variant.condition
            : "Unknown condition",
        printing:
          typeof variant.printing === "string" && variant.printing
            ? variant.printing
            : "Unknown printing",
        price: optionalNumber(variant.price),
        allTimeHigh: optionalNumber(variant.maxPriceAllTime),
        allTimeHighDate: optionalDateString(
          variant.maxPriceAllTimeDate ?? variant.maxPriceAllTime_date,
        ),
        allTimeLow: optionalNumber(variant.minPriceAllTime),
        allTimeLowDate: optionalDateString(
          variant.minPriceAllTimeDate ?? variant.minPriceAllTime_date,
        ),
      }));

    return Object.entries(
      variants.reduce<Record<string, JustTcgVariant[]>>((groups, variant) => {
        (groups[variant.printing] ??= []).push(variant);
        return groups;
      }, {})
    ).map(([printing, groupedVariants]) => ({
      id: `${cardId}-${printing}`,
      pokemonName,
      cardNumber,
      printing,
      setName,
      variants: [...groupedVariants].sort(
        (first, second) =>
          (second.price ?? -Infinity) - (first.price ?? -Infinity)
      ),
    }));
  });
}

function formatUsd(value: number | undefined): string {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

const UPDATED_AT_KEYS = [
  "updated",
  "updatedAt",
  "updated_at",
  "last_updated",
  "lastUpdated",
  "priceUpdatedAt",
  "price_updated_at",
] as const;

function readUpdatedAt(value: unknown): string | null {
  if (!isRecord(value)) return null;
  for (const key of UPDATED_AT_KEYS) {
    const field = value[key];
    if (typeof field === "string" && field.trim()) return field.trim();
  }
  return null;
}

function getJustTcgUpdatedAt(response: unknown): string | null {
  const topLevel = readUpdatedAt(response);
  if (topLevel) return topLevel;

  if (!isRecord(response) || !Array.isArray(response.data)) return null;

  for (const card of response.data) {
    const cardUpdated = readUpdatedAt(card);
    if (cardUpdated) return cardUpdated;
    if (!isRecord(card) || !Array.isArray(card.variants)) continue;
    for (const variant of card.variants) {
      const variantUpdated = readUpdatedAt(variant);
      if (variantUpdated) return variantUpdated;
    }
  }

  return null;
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

export function JustTcgVariants({ response }: JustTcgVariantsProps) {
  const groups = parseVariantGroups(response);
  const updatedAt =
    getJustTcgUpdatedAt(response) ?? new Date().toISOString().slice(0, 10);

  if (!groups.length) {
    return <p className="just-tcg-variants__empty">No JustTCG variants were returned.</p>;
  }

  return (
    <div className="just-tcg-variants ui-render-fade">
      <header className="just-tcg-variants__source-header">
        <h2 className="app-subheader">Just_TCG (Aggregator of price data)</h2>
      </header>
      {groups.map(({ id, pokemonName, cardNumber, printing, setName, variants }) => {
        const reverse = printing.toLowerCase().includes("reverse");

        return (
          <section
            className={`just-tcg-variants__section${reverse ? " just-tcg-variants__section--reverse" : ""}`}
            key={id}
          >
            <header>
              <div className="just-tcg-variants__heading">
                <span className="just-tcg-variants__brand">JustTCG</span>
                <div className="just-tcg-variants__printing">
                  <Layers3 aria-hidden="true" />
                  <span>{printing}</span>
                </div>
                <div className="just-tcg-variants__identity">
                  <strong className="just-tcg-variants__pokemon-name">{pokemonName}</strong>
                  {cardNumber && (
                    <>
                      <i aria-hidden="true">•</i>
                      <span className="just-tcg-variants__card-number">{cardNumber}</span>
                    </>
                  )}
                  <i aria-hidden="true">•</i>
                  <span className="just-tcg-variants__set-name">{setName}</span>
                </div>
              </div>
              <small>Sorted by price</small>
            </header>

            <div className="just-tcg-variants__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Condition</th>
                    <th>Current Price</th>
                    <th>Below ATH</th>
                    <th>All-Time High</th>
                    <th>All-Time Low</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((variant) => {
                    const canCalculateBelowAth =
                      variant.price !== undefined &&
                      variant.allTimeHigh !== undefined &&
                      variant.allTimeHigh > 0;
                    const belowAmount = canCalculateBelowAth
                      ? Math.max(0, variant.allTimeHigh! - variant.price!)
                      : undefined;
                    const belowPercent = canCalculateBelowAth
                      ? (belowAmount! / variant.allTimeHigh!) * 100
                      : undefined;
                    const athDate = formatPriceStamp(variant.allTimeHighDate);
                    const atlDate = formatPriceStamp(variant.allTimeLowDate);

                    return (
                      <tr key={variant.id}>
                        <td>{variant.condition}</td>
                        <td className="just-tcg-variants__current">{formatUsd(variant.price)}</td>
                        <td className="just-tcg-variants__below">
                          {belowAmount === undefined ? (
                            "—"
                          ) : (
                            <><span>-{formatUsd(belowAmount)}</span><small>({belowPercent!.toFixed(1)}%)</small></>
                          )}
                        </td>
                        <td className="just-tcg-variants__high">
                          <span className="just-tcg-variants__stat">
                            <span className="just-tcg-variants__stat-value">
                              {formatUsd(variant.allTimeHigh)}
                            </span>
                            {athDate && (
                              <small className="just-tcg-variants__stat-date">{athDate}</small>
                            )}
                          </span>
                        </td>
                        <td className="just-tcg-variants__low">
                          <span className="just-tcg-variants__stat">
                            <span className="just-tcg-variants__stat-value">
                              {formatUsd(variant.allTimeLow)}
                            </span>
                            {atlDate && (
                              <small className="just-tcg-variants__stat-date">{atlDate}</small>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <p className="just-tcg-variants__updated">
        Data updated {formatUpdatedAt(updatedAt)}
      </p>
    </div>
  );
}
