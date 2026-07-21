import { parseJsonText } from "../../../utils/parseJsonText";
import { UPLOAD_ANALYSIS_EMPTY_NOTE } from "../uploadCardCopy";
import "./AuthenticityResultView.scss";

type AuthenticityResultViewProps = {
  error: string;
  result: string;
};

type BreakdownItem = {
  category: string;
  score: number | null;
  status: string;
  comment: string;
};

type AuthenticityData = {
  verdict: string;
  confidencePercentage: number | null;
  confidenceLevel: string;
  summary: string;
  analysis: BreakdownItem[];
  strengths: string[];
  limitations: string[];
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

function parseAuthenticityResult(result: string): AuthenticityData | null {
  const parsed = parseJsonText(result);
  const root = asRecord(parsed);
  if (!root) return null;

  const authenticity = asRecord(root.authenticity) ?? {};
  const metadata = asRecord(root.metadata) ?? {};

  const rawBreakdown = Array.isArray(root.analysis_breakdown)
    ? root.analysis_breakdown
    : [];

  const analysis = rawBreakdown
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item, index) => ({
      category:
        asString(item.category) || asString(item.name) || `Category ${index + 1}`,
      score: asNumber(item.score),
      status: asString(item.status),
      comment: asString(item.comment) || asString(item.text),
    }))
    .filter((item) => item.category || item.comment || item.score !== null);

  const verdict = asString(authenticity.verdict);
  const summary = asString(authenticity.summary);
  const strengths = asStringList(root.strengths);
  const limitations = asStringList(root.limitations);
  const confidencePercentage =
    asNumber(authenticity.confidence_percentage) ??
    asNumber(metadata.ai_confidence);

  if (
    !verdict &&
    !summary &&
    !analysis.length &&
    !strengths.length &&
    !limitations.length
  ) {
    return null;
  }

  return {
    verdict,
    confidencePercentage,
    confidenceLevel: asString(authenticity.confidence_level),
    summary,
    analysis,
    strengths,
    limitations,
    notes: asString(metadata.notes),
  };
}

function verdictTone(verdict: string): "green" | "amber" | "red" {
  const value = verdict.toLowerCase();
  if (/(real|authentic|genuine)/.test(value)) return "green";
  if (/(fake|counterfeit|replica)/.test(value)) return "red";
  return "amber";
}

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

export default function AuthenticityResultView({
  error,
  result,
}: AuthenticityResultViewProps) {
  if (error) {
    return (
      <div className="auth-result ui-render-fade" key="error">
        <p className="auth-result__error">{error}</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="auth-result ui-render-fade" key="empty">
        <p className="auth-result__empty">{UPLOAD_ANALYSIS_EMPTY_NOTE}</p>
      </div>
    );
  }

  const data = parseAuthenticityResult(result);
  if (!data) {
    return (
      <div className="auth-result ui-render-fade" key="raw">
        <p className="auth-result__raw">{result}</p>
      </div>
    );
  }

  const tone = data.verdict ? verdictTone(data.verdict) : "amber";
  const hasVerdict =
    Boolean(data.verdict) ||
    data.confidencePercentage !== null ||
    Boolean(data.summary);
  return (
    <div className="auth-result ui-render-fade" key="result">
      {hasVerdict && (
        <section className="auth-result__section">
          <h3 className="app-subheader">Authenticity verdict</h3>
          <article className="auth-result__verdict">
            {(data.verdict || data.confidencePercentage !== null) && (
              <div className="auth-result__grade">
                {data.verdict && (
                  <strong
                    className={`auth-result__grade-value auth-result__grade-value--${tone}`}
                  >
                    {data.verdict}
                  </strong>
                )}
                {data.confidencePercentage !== null && (
                  <span className="auth-result__condition">
                    {data.confidencePercentage}%
                    {data.confidenceLevel
                      ? ` · ${data.confidenceLevel} confidence`
                      : " confidence"}
                  </span>
                )}
                {data.confidencePercentage === null && data.confidenceLevel && (
                  <span className="auth-result__condition">
                    {data.confidenceLevel} confidence
                  </span>
                )}
              </div>
            )}
            {data.summary && (
              <p className="auth-result__summary">{data.summary}</p>
            )}
          </article>
        </section>
      )}

      {data.analysis.length > 0 && (
        <section className="auth-result__section">
          <h3 className="app-subheader">Analysis breakdown</h3>
          <div className="auth-result__grid">
            {data.analysis.map((item, index) => (
              <article
                className="auth-result__card"
                key={item.category || `item-${index}`}
              >
                <header className="auth-result__card-header">
                  {item.category && <h4>{item.category}</h4>}
                  <div className="auth-result__card-meta">
                    {item.status && (
                      <span className="auth-result__status">{item.status}</span>
                    )}
                    {item.score !== null && (
                      <strong className="auth-result__score">
                        {formatScore(item.score)}
                        <span>/10</span>
                      </strong>
                    )}
                  </div>
                </header>
                {item.comment && <p>{item.comment}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      {(data.strengths.length > 0 || data.limitations.length > 0) && (
        <section className="auth-result__section">
          <div className="auth-result__grid">
            {data.strengths.length > 0 && (
              <article className="auth-result__card">
                <h4>Strengths</h4>
                <ul>
                  {data.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            )}
            {data.limitations.length > 0 && (
              <article className="auth-result__card">
                <h4>Limitations</h4>
                <ul>
                  {data.limitations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            )}
          </div>
        </section>
      )}

      {data.notes && (
        <section className="auth-result__section">
          <article className="auth-result__card">
            <h4>Notes</h4>
            <p>{data.notes}</p>
          </article>
        </section>
      )}
    </div>
  );
}
