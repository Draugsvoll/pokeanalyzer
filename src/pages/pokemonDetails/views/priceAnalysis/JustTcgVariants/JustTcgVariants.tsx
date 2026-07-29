import { useState } from "react";
import { ChevronDown, ChevronUp, Layers3 } from "lucide-react";
import { formatDateStamp } from "../../../../../utils/formatDateStamp";
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
  updatedAt?: string;
};

type JustTcgVariantGroup = {
  id: string;
  printing: string;
  setName?: string;
  cardNumber?: string;
  variants: JustTcgVariant[];
  updatedAt?: string;
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
    const setName =
      typeof card.set_name === "string" && card.set_name.trim()
        ? card.set_name.trim()
        : undefined;
    const cardNumber =
      (typeof card.number === "string" || typeof card.number === "number") &&
      String(card.number).trim()
        ? String(card.number).trim()
        : undefined;
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
        updatedAt: optionalDateString(variant.lastUpdated),
      }));

    return Object.entries(
      variants.reduce<Record<string, JustTcgVariant[]>>((groups, variant) => {
        (groups[variant.printing] ??= []).push(variant);
        return groups;
      }, {})
    ).map(([printing, groupedVariants]) => ({
      id: `${cardId}-${printing}`,
      printing,
      setName,
      cardNumber,
      variants: [...groupedVariants].sort(
        (first, second) =>
          (second.price ?? -Infinity) - (first.price ?? -Infinity)
      ),
      updatedAt: groupedVariants
        .map((variant) => variant.updatedAt)
        .filter((value): value is string => Boolean(value))
        .sort((first, second) => Date.parse(second) - Date.parse(first))[0],
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

export function JustTcgVariants({ response }: JustTcgVariantsProps) {
  const groups = parseVariantGroups(response);
  const [expandedConditionGroups, setExpandedConditionGroups] = useState<Set<string>>(
    () => new Set(),
  );

  function toggleConditions(groupId: string) {
    setExpandedConditionGroups((current) => {
      const next = new Set(current);

      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }

      return next;
    });
  }

  if (!groups.length) {
    return (
      <div className="just-tcg-variants ui-render-fade">
        <header className="just-tcg-variants__source-header">
          <h2 className="app-subheader">Just_TCG (Aggregator of price data)</h2>
        </header>
        <div className="just-tcg-variants__list">
          <section className="just-tcg-variants__section just-tcg-variants__section--empty">
            <div className="just-tcg-variants__empty">
              <strong>Price data unavailable</strong>
              <span>JustTCG did not return usable pricing for this card.</span>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const latestUpdatedAt = groups
    .map((group) => group.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort((first, second) => Date.parse(second) - Date.parse(first))[0];

  return (
    <div className="just-tcg-variants ui-render-fade">
      <header className="just-tcg-variants__source-header">
        <h2 className="app-subheader">Aggregated Sales Prices (Just TCG)</h2>
      </header>
      <div className="just-tcg-variants__list">
        {groups.map(({ id, printing, setName, cardNumber, variants }) => {
          const reverse = printing.toLowerCase().includes("reverse");
          const expanded = expandedConditionGroups.has(id);
          const visibleConditions = expanded ? variants : variants.slice(0, 2);
          const hasAdditionalConditions = variants.length > 2;
          const identityParts = [
            { kind: "number", value: cardNumber },
            { kind: "set", value: setName },
          ].filter(
            (part): part is { kind: string; value: string } =>
              Boolean(part.value),
          );

          return (
            <div className="just-tcg-variants__section-block" key={id}>
            <section
              className={`just-tcg-variants__section${reverse ? " just-tcg-variants__section--reverse" : ""}`}
            >
              <header>
                <span className="just-tcg-variants__printing">
                  <Layers3 aria-hidden="true" />
                  <span>{printing}</span>
                </span>
                <div className="just-tcg-variants__card-identity">
                  {identityParts.map((part, index) => (
                    <span
                      className={
                        part.kind === "number"
                          ? "just-tcg-variants__identity-number"
                          : undefined
                      }
                      key={`${part.kind}-${part.value}`}
                    >
                      {index > 0 && <i aria-hidden="true">•</i>}
                      {part.value}
                    </span>
                  ))}
                </div>
              </header>

              <div className="just-tcg-variants__table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Condition</th>
                      <th>Current Price</th>
                      <th>All-Time High</th>
                      <th>All-Time Low</th>
                      <th>Below ATH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleConditions.map((variant) => {
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
                          <td className="just-tcg-variants__below">
                            {belowAmount === undefined ? (
                              "—"
                            ) : (
                              <>
                                <span>-{formatUsd(belowAmount)}</span>
                                <small>({belowPercent!.toFixed(1)}%)</small>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {hasAdditionalConditions && (
                <button
                  className="just-tcg-variants__conditions-toggle"
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => toggleConditions(id)}
                >
                  <span>
                    {expanded ? "Show fewer conditions" : "View all conditions"}
                  </span>
                  {expanded ? (
                    <ChevronUp aria-hidden="true" />
                  ) : (
                    <ChevronDown aria-hidden="true" />
                  )}
                </button>
              )}
            </section>
            </div>
          );
        })}
      </div>
      {latestUpdatedAt && (
        <p className="app-view-datestamp">
          Last updated: {formatDateStamp(latestUpdatedAt)}
        </p>
      )}
    </div>
  );
}
