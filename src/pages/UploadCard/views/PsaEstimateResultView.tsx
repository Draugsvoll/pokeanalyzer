import { parseJsonText } from "../../../utils/parseJsonText";
import { UPLOAD_ANALYSIS_EMPTY_NOTE } from "../uploadCardCopy";
import "./PsaEstimateResultView.scss";

type PsaEstimateResultViewProps = {
  error: string;
  result: string;
};

type ConditionItem = {
  category: string;
  score: number | null;
  comment: string;
};

type PsaEstimateData = {
  grade: number | null;
  conditionLabel: string;
  cardIdentified: string;
  conditionReport: ConditionItem[];
  summary: string;
  imageLimitations: string[];
  notes: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

function parsePsaEstimateResult(result: string): PsaEstimateData | null {
  const parsed = parseJsonText(result);
  const root = asRecord(parsed);
  if (!root) return null;

  const overall = asRecord(root.overall) ?? {};

  const rawReport = Array.isArray(root.condition_report)
    ? root.condition_report
    : Array.isArray(root.subgrades)
      ? root.subgrades
      : [];

  const conditionReport = rawReport
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item, index) => ({
      category: asString(item.category) || asString(item.name) || `Category ${index + 1}`,
      score: asNumber(item.score),
      comment: asString(item.comment) || asString(item.text) || asString(item.notes),
    }))
    .filter((item) => item.category || item.comment || item.score !== null);

  return {
    grade: asNumber(overall.grade) ?? asNumber(root.grade),
    conditionLabel:
      asString(overall.condition_label) ||
      asString(overall.conditionLabel) ||
      asString(root.condition_label),
    cardIdentified:
      asString(root.card_identified) || asString(root.cardIdentified),
    conditionReport,
    summary: asString(root.summary),
    imageLimitations: asStringList(root.image_limitations).length
      ? asStringList(root.image_limitations)
      : asStringList(root.limitations),
    notes: asString(root.notes),
  };
}

function scoreTone(score: number): "green" | "amber" | "red" {
  if (score >= 8) return "green";
  if (score >= 6.5) return "amber";
  return "red";
}

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function formatConditionLabel(label: string): string {
  if (!label) return "";
  const expanded: Record<string, string> = {
    NM: "Near Mint",
    "NM-MT": "Near Mint–Mint",
    MINT: "Mint",
    GEM: "Gem Mint",
    "GEM-MT": "Gem Mint",
    EX: "Excellent",
    "EX-MT": "Excellent–Mint",
    VG: "Very Good",
    "VG-EX": "Very Good–Excellent",
    G: "Good",
  };
  return expanded[label.toUpperCase()] ?? label;
}

export default function PsaEstimateResultView({
  error,
  result,
}: PsaEstimateResultViewProps) {
  if (error) {
    return (
      <div className="psa-estimate ui-render-fade" key="error">
        <p className="psa-estimate__error">{error}</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="psa-estimate ui-render-fade" key="empty">
        <p className="psa-estimate__empty">{UPLOAD_ANALYSIS_EMPTY_NOTE}</p>
      </div>
    );
  }

  const data = parsePsaEstimateResult(result);
  if (!data) {
    return (
      <div className="psa-estimate ui-render-fade" key="raw">
        <p className="psa-estimate__raw">{result}</p>
      </div>
    );
  }

  const conditionLabel = formatConditionLabel(data.conditionLabel);
  const hasOverall =
    data.grade !== null || Boolean(conditionLabel) || Boolean(data.summary);
  const gradeTone =
    data.grade === null ? "amber" : scoreTone(data.grade);

  const hasAnything =
    hasOverall ||
    data.conditionReport.length > 0 ||
    data.imageLimitations.length > 0;

  if (!hasAnything) {
    return (
      <div className="psa-estimate ui-render-fade" key="raw">
        <p className="psa-estimate__raw">{result}</p>
      </div>
    );
  }

  return (
    <div className="psa-estimate ui-render-fade" key="result">
      {hasOverall && (
        <section className="psa-estimate__section">
          <h3 className="app-subheader">Estimated PSA grade</h3>
          <article className="psa-estimate__verdict">
            {(data.grade !== null || conditionLabel) && (
              <div className="psa-estimate__grade">
                {data.grade !== null && (
                  <strong
                    className={`psa-estimate__grade-value psa-estimate__grade-value--${gradeTone}`}
                  >
                    PSA {formatScore(data.grade)}
                  </strong>
                )}
                {conditionLabel && (
                  <span className="psa-estimate__condition">{conditionLabel}</span>
                )}
              </div>
            )}
            {data.summary && (
              <p className="psa-estimate__summary">{data.summary}</p>
            )}
          </article>
        </section>
      )}

      {data.conditionReport.length > 0 && (
        <section className="psa-estimate__section">
          <h3 className="app-subheader">Condition report</h3>
          <div className="psa-estimate__grid">
            {data.conditionReport.map((item, index) => (
              <article
                className="psa-estimate__card"
                key={item.category || `item-${index}`}
              >
                <header className="psa-estimate__card-header">
                  {item.category && <h4>{item.category}</h4>}
                  {item.score !== null && (
                    <strong className="psa-estimate__score">
                      {formatScore(item.score)}
                      <span>/10</span>
                    </strong>
                  )}
                </header>
                {item.comment && <p>{item.comment}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      {data.imageLimitations.length > 0 && (
        <section className="psa-estimate__section">
          <article className="psa-estimate__card psa-estimate__card--limitations">
            <h4>Image limitations</h4>
            <ul>
              {data.imageLimitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </section>
      )}
    </div>
  );
}
