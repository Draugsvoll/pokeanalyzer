import { LoadingState } from "../../../../components/loadingState/LoadingState";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
import { parseJsonText } from "../../../../utils/parseJsonText";
import "./SellPriceView.scss";

type SellPriceViewProps = {
  grokRequest: GrokRequestState;
};

type SellPriceStep = {
  details: unknown[];
  title: string;
};

type SellPriceRecommendation = {
  label: string;
  value: string;
};

type JsonRecord = Record<string, unknown>;

const TITLE_KEYS = ["step", "title", "name", "heading"] as const;
const DETAIL_KEYS = ["substeps", "actions", "details", "recommendations"] as const;
const LABEL_KEYS = ["condition", "grade", "label", "name", "title", "substep"];
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
  const recommendation = getRecommendation(detail);
  return !recommendation.label
    ? recommendation.value
    : `${recommendation.label}: ${recommendation.value}`;
}

function parseSellPriceSteps(parsed: unknown): SellPriceStep[] | null {
  const rawSteps = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.steps)
      ? parsed.steps
      : isRecord(parsed)
        ? [parsed]
        : null;

  if (!rawSteps) return null;

  return rawSteps.map((rawStep, index) => {
    if (!isRecord(rawStep)) {
      return {
        details: [rawStep],
        title: formatValue(rawStep) || `Step ${index + 1}`,
      };
    }

    const titleEntry = TITLE_KEYS.find((key) => formatValue(rawStep[key]));
    const detailsEntry = DETAIL_KEYS.find((key) => Array.isArray(rawStep[key]));
    const nestedDetails = detailsEntry
      ? (rawStep[detailsEntry] as unknown[])
      : [];
    const remainingDetails = Object.entries(rawStep)
      .filter(([key]) => key !== titleEntry && key !== detailsEntry)
      .map(([key, value]) => ({ [key]: value }));

    return {
      details: [...nestedDetails, ...remainingDetails],
      title: titleEntry
        ? formatValue(rawStep[titleEntry])
        : `Step ${index + 1}`,
    };
  });
}

export function SellPriceView({ grokRequest }: SellPriceViewProps) {
  const { loading, error, response } = grokRequest;

  if (loading) return <LoadingState>Calculating selling price...</LoadingState>;
  if (error) return <p className="card-view__page-error">{error}</p>;
  if (!response) return null;

  const parsedResponse = parseJsonText(response);
  const steps = parseSellPriceSteps(parsedResponse);
  const prettyResponse = parsedResponse === null
    ? response
    : JSON.stringify(parsedResponse, null, 2);

  return (
    <section className="sell-price-view ui-render-fade">
      {steps && (
        <ol className="sell-price-view__steps">
          {steps.map((step, index) => {
            if (index === 0) {
              return (
                <li
                  className="sell-price-view__step sell-price-view__step--pricing"
                  key={`${step.title}-${index}`}
                >
                  <header>
                    <h3>{step.title}</h3>
                  </header>
                  {step.details.length > 0 && (
                    <ul>
                      {step.details.map((detail, detailIndex) => {
                        const recommendation = getRecommendation(detail);
                        return (
                          <li key={`${recommendation.label}-${detailIndex}`}>
                            {recommendation.label && <span>{recommendation.label}</span>}
                            <strong>{recommendation.value}</strong>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            }

            return (
              <li
                className="sell-price-view__step sell-price-view__step--guidance"
                key={`${step.title}-${index}`}
              >
                <header>
                  <h3>{step.title}</h3>
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
              </li>
            );
          })}
        </ol>
      )}

      <section className="sell-price-view__json">
        <h3>Full JSON response</h3>
        <pre>{prettyResponse}</pre>
      </section>
    </section>
  );
}
