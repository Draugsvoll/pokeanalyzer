import { Layers3 } from "lucide-react";
import { useEffect, useState } from "react";
import { LoadingState } from "../../../../components/loadingState/LoadingState";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
import { parseJsonText } from "../../../../utils/parseJsonText";
import { FEATURE_ERROR_MESSAGE } from "../featureError";
import "./SellPriceView.scss";

type SellPriceViewProps = {
  grokRequest: GrokRequestState;
};

type SellPriceStep = {
  details: unknown[];
  title: string;
};

type SellPriceVariant = {
  notes: string[];
  steps: SellPriceStep[];
  title: string;
};

type SellPriceContent = {
  marketplaceStep?: SellPriceStep;
  variants: SellPriceVariant[];
};

type SellPriceRecommendation = {
  label: string;
  value: string;
};

type JsonRecord = Record<string, unknown>;

const TITLE_KEYS = ["step", "title", "name", "heading"] as const;
const DETAIL_KEYS = ["substeps", "actions", "details", "recommendations"] as const;
const LABEL_KEYS = ["condition", "grade", "label", "name", "title", "substep"];
const VARIANT_KEYS = ["variant", "variant_name", "name", "title"] as const;
const MARKETPLACE_KEYS = [
  "marketplace_availability",
  "marketplaces",
  "marketplace_available",
  "available_marketplaces",
] as const;
const NOTES_KEYS = ["notes", "variant_notes", "collector_notes"] as const;
const VALUE_KEYS = [
  "price",
  "price_range",
  "recommended_price",
  "recommendation",
  "selling_price",
  "value",
  "range",
  "description",
  "text",
  "content",
];

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map(formatValue).filter(Boolean).join(", ");
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, item]) => {
        const formatted = formatValue(item);
        return formatted ? `${formatLabel(key)}: ${formatted}` : "";
      })
      .filter(Boolean)
      .join(" · ");
  }
  return String(value);
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findRecordKey(record: JsonRecord, candidates: string[]) {
  const normalizedCandidates = candidates.map(normalizeKey);
  return Object.keys(record).find((key) =>
    normalizedCandidates.includes(normalizeKey(key))
  );
}

function getRecommendation(detail: unknown): SellPriceRecommendation {
  if (!isRecord(detail)) {
    const text = formatValue(detail);
    const separatorIndex = text.indexOf(":");
    if (separatorIndex > 0) {
      return {
        label: text.slice(0, separatorIndex).trim(),
        value: text.slice(separatorIndex + 1).trim(),
      };
    }
    return {
      label: "",
      value: text,
    };
  }

  const labelKey = findRecordKey(detail, LABEL_KEYS);
  const valueKey = findRecordKey(detail, VALUE_KEYS);
  if (labelKey || valueKey) {
    return {
      label: labelKey ? formatValue(detail[labelKey]) : "",
      value: valueKey ? formatValue(detail[valueKey]) : formatValue(detail),
    };
  }

  const [firstEntry] = Object.entries(detail);
  return firstEntry
    ? { label: formatLabel(firstEntry[0]), value: formatValue(firstEntry[1]) }
    : { label: "", value: "" };
}

function getGuidanceText(detail: unknown) {
  if (isRecord(detail)) {
    const labelKey = findRecordKey(detail, LABEL_KEYS);
    const valueKey = findRecordKey(detail, [
      "time",
      "timeline",
      "expected_time",
      "expected_sales_time",
      "volume",
      "sales_volume",
      "source",
      "sources",
      "recommendation",
      "description",
      "text",
      "content",
    ]);

    if (labelKey && valueKey) {
      return `${formatValue(detail[labelKey])}: ${formatValue(detail[valueKey])}`;
    }
  }

  const recommendation = getRecommendation(detail);
  return !recommendation.label
    ? recommendation.value
    : `${recommendation.label}: ${recommendation.value}`;
}

function parseStep(rawStep: unknown, index: number): SellPriceStep {
  if (!isRecord(rawStep)) {
    return {
      details: [rawStep],
      title: formatValue(rawStep) || `Step ${index + 1}`,
    };
  }

  const titleEntry = TITLE_KEYS.find((key) => formatValue(rawStep[key]));
  const detailsEntry = DETAIL_KEYS.find((key) => Array.isArray(rawStep[key]));
  const nestedDetails = detailsEntry ? (rawStep[detailsEntry] as unknown[]) : [];
  const remainingDetails = Object.entries(rawStep)
    .filter(([key]) => key !== titleEntry && key !== detailsEntry)
    .map(([key, value]) => ({ [key]: value }));

  return {
    details: [...nestedDetails, ...remainingDetails],
    title: titleEntry ? formatValue(rawStep[titleEntry]) : `Step ${index + 1}`,
  };
}

function parseSellPriceContent(parsed: unknown): SellPriceContent | null {
  if (isRecord(parsed) && Array.isArray(parsed.variants)) {
    const variants = parsed.variants
      .map((variant, variantIndex): SellPriceVariant | null => {
        if (!isRecord(variant)) return null;

        const variantNameKey = VARIANT_KEYS.find((key) =>
          formatValue(variant[key]),
        );
        const variantName = variantNameKey
          ? formatValue(variant[variantNameKey])
          : `Variant ${variantIndex + 1}`;
        const rawVariantSteps = Array.isArray(variant.steps)
          ? variant.steps
          : Array.isArray(variant.categories)
            ? variant.categories
            : [];

        const steps = rawVariantSteps
          .map(parseStep)
          .filter((step) => step.details.length > 0);
        const notesKey = NOTES_KEYS.find((key) => Array.isArray(variant[key]));
        const notes = notesKey
          ? (variant[notesKey] as unknown[]).map(formatValue).filter(Boolean)
          : [];
        if (steps.length === 0 && notes.length === 0) return null;
        return {
          notes,
          steps,
          title: variantName,
        };
      })
      .filter((variant): variant is SellPriceVariant => Boolean(variant));

    const marketplaceKey = MARKETPLACE_KEYS.find((key) =>
      Array.isArray(parsed[key]),
    );
    const marketplaceStep = marketplaceKey
      ? {
          details: parsed[marketplaceKey] as unknown[],
          title: "Marketplaces",
        }
      : undefined;

    return variants.length > 0 || marketplaceStep
      ? { marketplaceStep, variants }
      : null;
  }

  const rawSteps = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.steps)
      ? parsed.steps
      : isRecord(parsed) && Array.isArray(parsed.results)
        ? parsed.results
      : isRecord(parsed)
        ? [parsed]
        : null;

  if (!rawSteps) return null;

  const steps = rawSteps.map(parseStep).filter((step) => step.details.length > 0);
  return steps.length > 0
    ? { variants: [{ notes: [], steps, title: "Price guide" }] }
    : null;
}

function isPriceRecommendations(step: SellPriceStep, index: number) {
  return index === 0 || /price/i.test(step.title);
}

function getStepOrder(step: SellPriceStep, index: number) {
  const title = step.title.toLowerCase();
  if (isPriceRecommendations(step, index)) return 0;
  if (title.includes("expected") || title.includes("time")) return 1;
  if (title.includes("sales volume") || title.includes("sources")) return 2;
  return 3;
}

export function SellPriceView({ grokRequest }: SellPriceViewProps) {
  const { loading, error, response } = grokRequest;
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);

  useEffect(() => {
    setSelectedVariantIndex(0);
  }, [response]);

  if (loading) return <LoadingState>Calculating selling price...</LoadingState>;
  if (error) return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  if (!response) return null;

  const parsedResponse = parseJsonText(response);
  const content = parseSellPriceContent(parsedResponse);
  if (!content || (content.variants.length === 0 && !content.marketplaceStep)) {
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  }

  const activeVariantIndex = content.variants[selectedVariantIndex]
    ? selectedVariantIndex
    : 0;
  const activeVariant = content.variants[activeVariantIndex];
  const orderedSteps = activeVariant?.steps
    .map((step, index) => ({ index, step }))
    .sort(
      (a, b) =>
        getStepOrder(a.step, a.index) - getStepOrder(b.step, b.index) ||
        a.index - b.index,
    );

  return (
    <section className="sell-price-view ui-render-fade">
      <ol className="sell-price-view__variants">
        {activeVariant && (
          <li className="sell-price-view__variant feature-card-surface">
            <header className="feature-panel-header">
              <h3 className="feature-section-heading">Selling</h3>
            </header>
            <div className="sell-price-view__body feature-panel-body">
              <fieldset
                aria-label="Sell guide variant"
                className="sell-price-view__variant-selector feature-variant-radio-group"
              >
                <div>
                  {content.variants.map((variant, variantIndex) => (
                    <label key={`${variant.title}-${variantIndex}`}>
                      <input
                        checked={activeVariantIndex === variantIndex}
                        name="sell-price-variant"
                        onChange={() => setSelectedVariantIndex(variantIndex)}
                        type="radio"
                      />
                      <span>
                        <Layers3 size={16} strokeWidth={2.1} />
                        <strong>{variant.title}</strong>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="sell-price-view__variant-steps">
                {orderedSteps.map(({ index: originalIndex, step }, stepIndex) => {
                  if (isPriceRecommendations(step, originalIndex)) {
                    return (
                      <section
                        className="sell-price-view__step sell-price-view__step--pricing"
                        key={`${activeVariant.title}-${step.title}-${stepIndex}`}
                      >
                        <header>
                          <h4>{step.title}</h4>
                        </header>
                        {step.details.length > 0 && (
                          <ul>
                            {step.details.map((detail, detailIndex) => {
                              const recommendation = getRecommendation(detail);
                              return (
                                <li
                                  className="feature-card-inner-surface"
                                  key={`${recommendation.label}-${detailIndex}`}
                                >
                                  {recommendation.label && <span>{recommendation.label}</span>}
                                  <strong>{recommendation.value}</strong>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </section>
                    );
                  }

                  return (
                    <section
                      className="sell-price-view__step sell-price-view__step--guidance"
                      key={`${activeVariant.title}-${step.title}-${stepIndex}`}
                    >
                      <header>
                        <h4>{step.title}</h4>
                      </header>
                      {step.details.length > 0 && (
                        <ul>
                          {step.details.map((detail, detailIndex) => (
                            <li key={`${getGuidanceText(detail)}-${detailIndex}`}>
                              {getGuidanceText(detail)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
                {activeVariant.notes.length > 0 && (
                  <section className="sell-price-view__step sell-price-view__step--notes">
                    <ul>
                      {activeVariant.notes.map((note, noteIndex) => (
                        <li className="feature-note-surface" key={`${note}-${noteIndex}`}>
                          {note}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </div>
          </li>
        )}

        {content.marketplaceStep && (
          <li className="sell-price-view__variant feature-card-surface">
            <header className="feature-panel-header">
              <h3 className="feature-section-heading">
                {content.marketplaceStep.title}
              </h3>
            </header>
            <div className="sell-price-view__variant-steps feature-panel-body">
              <section className="sell-price-view__step sell-price-view__step--guidance">
                {content.marketplaceStep.details.length > 0 && (
                  <ul>
                    {content.marketplaceStep.details.map((detail, detailIndex) => (
                      <li key={`${getGuidanceText(detail)}-${detailIndex}`}>
                        {getGuidanceText(detail)}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </li>
        )}
      </ol>
    </section>
  );
}
