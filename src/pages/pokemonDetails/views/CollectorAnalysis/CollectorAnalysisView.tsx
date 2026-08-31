import {
  Clock3,
  FileText,
  Gem,
  Landmark,
  Layers3,
  Palette,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { parseJsonText } from "../../../../utils/parseJsonText";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
import { FEATURE_ERROR_MESSAGE } from "../featureError";
import { LoadingState } from "../../../../components/loadingState/LoadingState";
import { Badge } from "../../../../components/ui/Badge";
import "./CollectorAnalysisView.scss";

type CollectorCategory = {
  name: string;
  score: string;
  text: string;
};

type CollectorAnalysisData = {
  variantName: string;
  totalScore: string;
  verdict: string;
  overview: string;
  categories: CollectorCategory[];
  finalNote: string;
};

type CollectorAnalysisProps = {
  grokRequest: GrokRequestState;
};

const categoryIcons: LucideIcon[] = [Gem, Users, Landmark, Palette, Clock3];

function getScoreTone(score: number) {
  if (score >= 90) return "Elite collectible";
  if (score >= 75) return "Highly collectible";
  if (score >= 60) return "Desirable";
  if (score >= 45) return "Moderate appeal";
  if (score >= 30) return "Limited appeal";
  if (score >= 15) return "Low appeal";
  return "Minimal appeal";
}

function parseCollectorAnalysisEntry(
  data: Record<string, unknown>,
): CollectorAnalysisData | null {
  if (!Array.isArray(data.categories)) return null;

  const categories = data.categories
    .filter(
      (category): category is Record<string, unknown> =>
        Boolean(category) &&
        typeof category === "object" &&
        !Array.isArray(category),
    )
    .map((category) => ({
      name: String(category.name ?? "Category"),
      score: String(category.score ?? "0"),
      text: String(category.text ?? ""),
    }));

  const variantName =
    typeof data.variant_name === "string" ? data.variant_name.trim() : "";
  if (!variantName) return null;

  return {
    variantName,
    totalScore: String(data.totalScore ?? "0"),
    verdict: String(data.verdict ?? ""),
    overview: String(data.overview ?? ""),
    categories,
    finalNote: String(data.finalNote ?? ""),
  };
}

function parseCollectorAnalysis(
  response: string,
): CollectorAnalysisData[] | null {
  const value = parseJsonText(response);

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const root = value as Record<string, unknown>;
  const rawAnalyses: unknown[] = Array.isArray(root.analyses)
    ? root.analyses
    : [];

  const analyses = rawAnalyses
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .map(parseCollectorAnalysisEntry)
    .filter((analysis): analysis is CollectorAnalysisData => Boolean(analysis));

  return analyses.length > 0 ? analyses : null;
}

export default function CollectorAnalysis({
  grokRequest,
}: CollectorAnalysisProps) {
  const { loading, error, response } = grokRequest;
  const responseKey = response ?? "";
  const [selectedVariant, setSelectedVariant] = useState({
    index: 0,
    responseKey: "",
  });

  if (loading) return <LoadingState>Building collector report...</LoadingState>;
  if (error)
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  if (!response) return null;

  const analyses = parseCollectorAnalysis(response);
  if (!analyses) {
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  }

  const selectedVariantIndex =
    selectedVariant.responseKey === responseKey ? selectedVariant.index : 0;
  const activeVariantIndex = analyses[selectedVariantIndex]
    ? selectedVariantIndex
    : 0;
  const analysis = analyses[activeVariantIndex];
  const totalScore = Math.min(
    100,
    Math.max(0, Number(analysis.totalScore) || 0),
  );
  const scoreTone = getScoreTone(totalScore);

  return (
    <div className="collector-ranking ui-render-fade">
      <fieldset
        aria-label="Collector analysis variant"
        className="collector-ranking__variant-selector feature-variant-radio-group"
      >
        <div>
          {analyses.map((variantAnalysis, variantIndex) => (
            <label key={`${variantAnalysis.variantName}-${variantIndex}`}>
              <input
                checked={activeVariantIndex === variantIndex}
                name="collector-analysis-variant"
                onChange={() =>
                  setSelectedVariant({ index: variantIndex, responseKey })
                }
                type="radio"
              />
              <span>
                <Layers3 aria-hidden="true" />
                <strong>{variantAnalysis.variantName}</strong>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div
        className="collector-ranking__content ui-render-fade"
        key={`${responseKey}-${activeVariantIndex}`}
      >
        <div className="feature-analysis-accent-container">
          <div className="feature-analysis-score-block">
            <div
              className="feature-analysis-score"
              style={
                {
                  "--feature-analysis-score-value": totalScore,
                } as CSSProperties
              }
              role="img"
              aria-label={`Overall collector score: ${totalScore} out of 100`}
            >
              <div>
                <strong>{totalScore}</strong>
                <span>/100</span>
              </div>
            </div>
          </div>
          <div className="feature-analysis-summary-content">
            <div className="feature-analysis-summary-meta">
              <span className="feature-analysis-eyebrow">Overall score</span>
              <Badge accent="blue" weight="strong">
                {scoreTone}
              </Badge>
            </div>
            {analysis.verdict && (
              <strong className="feature-analysis-headline feature-analysis-summary-headline">
                {analysis.verdict}
              </strong>
            )}
            <h4 className="feature-analysis-summary feature-analysis-summary-text">
              {analysis.overview}
            </h4>
          </div>
        </div>

        <div className="collector-ranking__categories">
          {analysis.categories.map((category, index) => {
            const Icon = categoryIcons[index] ?? Gem;
            const score = Math.min(
              100,
              Math.max(0, Number(category.score) || 0),
            );

            return (
              <article
                key={`${category.name}-${index}`}
                className="collector-ranking__category default-container"
              >
                <div className="feature-analysis-card-header">
                  <h4>
                    <Icon size={19} aria-hidden="true" />
                    {category.name}
                  </h4>
                  <strong>{score}</strong>
                </div>
                <div
                  className="collector-ranking__bar"
                  role="progressbar"
                  aria-label={category.name}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={score}
                >
                  <span style={{ width: `${score}%` }} />
                </div>
                <p>{category.text}</p>
              </article>
            );
          })}
        </div>

        {analysis.finalNote && (
          <section className="collector-ranking__conclusion collector-ranking__category default-container">
            <div className="feature-analysis-card-header">
              <h4>
                <FileText size={19} aria-hidden="true" />
                Conclusion
              </h4>
            </div>
            <p>{analysis.finalNote}</p>
          </section>
        )}
      </div>
    </div>
  );
}
