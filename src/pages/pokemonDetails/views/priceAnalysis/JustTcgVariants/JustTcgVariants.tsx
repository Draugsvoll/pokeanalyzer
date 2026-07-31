import { formatDateStamp } from "../../../../../utils/formatDateStamp";
import { JustTcgPriceHistory } from "./JustTcgPriceHistory";
import type {
  JustTcgPricePoint,
  JustTcgVariant,
  JustTcgVariantGroup,
} from "./justTcgTypes";
import "./JustTcgVariants.scss";

type JsonRecord = Record<string, unknown>;

type JustTcgVariantsProps = {
  response: unknown;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
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

function parsePriceHistory(value: unknown): JustTcgPricePoint[] {
  if (!Array.isArray(value)) return [];

  const pointsByTimestamp = new Map<number, JustTcgPricePoint>();
  for (const point of value) {
    if (!isRecord(point)) continue;
    const price = optionalNumber(point.p);
    const rawTimestamp = optionalNumber(point.t);
    if (price === undefined || price <= 0 || rawTimestamp === undefined) {
      continue;
    }

    const timestamp = rawTimestamp < 1e12 ? rawTimestamp * 1000 : rawTimestamp;
    if (!Number.isFinite(new Date(timestamp).getTime())) continue;
    pointsByTimestamp.set(timestamp, { price, timestamp });
  }

  return [...pointsByTimestamp.values()]
    .sort((first, second) => first.timestamp - second.timestamp)
    .slice(-366);
}

function parseVariantGroups(response: unknown): JustTcgVariantGroup[] {
  if (!isRecord(response) || !Array.isArray(response.data)) return [];

  return response.data.flatMap((card, cardIndex) => {
    if (!isRecord(card) || !Array.isArray(card.variants)) return [];

    const cardId = String(card.id ?? cardIndex);
    const cardName =
      typeof card.name === "string" && card.name.trim()
        ? card.name.trim()
        : undefined;
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
        priceHistory: parsePriceHistory(variant.priceHistory),
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
      }, {}),
    ).map(([printing, groupedVariants]) => ({
      id: `${cardId}-${printing}`,
      cardName,
      printing,
      setName,
      cardNumber,
      variants: [...groupedVariants].sort(
        (first, second) =>
          (second.price ?? -Infinity) - (first.price ?? -Infinity),
      ),
      updatedAt: groupedVariants
        .map((variant) => variant.updatedAt)
        .filter((value): value is string => Boolean(value))
        .sort((first, second) => Date.parse(second) - Date.parse(first))[0],
    }));
  });
}

export function JustTcgVariants({ response }: JustTcgVariantsProps) {
  const groups = parseVariantGroups(response);

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
      <JustTcgPriceHistory groups={groups} />
      {latestUpdatedAt && (
        <p className="app-view-datestamp">
          Last updated: {formatDateStamp(latestUpdatedAt)}
        </p>
      )}
    </div>
  );
}
