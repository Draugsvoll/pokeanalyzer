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
import { parseScoreString } from "../../../../../shared/analysisScores";
import { useState } from "react";
import { parseJsonText } from "../../../../utils/parseJsonText";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
import { FEATURE_ERROR_MESSAGE } from "../featureError";
import { Badge } from "../../../../components/ui/Badge";
import { FeatureAnalysisHero } from "../../components/FeatureAnalysisPanel";
import { GrokLoadingState } from "../../components/GrokLoadingState";
import "./CollectorAnalysisView.scss";

type CollectorCategory = {
  name: string;
  score: number;
  text: string;
};

type CollectorAnalysisData = {
  variantName: string;
  totalScore: number;
  verdict: string;
  overview: string;
  categories: CollectorCategory[];
  finalNote: string[];
};

type CollectorAnalysisProps = {
  grokRequest: GrokRequestState;
};

const categories: { name: string; icon: LucideIcon }[] = [
  { name: "Rarity & Scarcity", icon: Gem },
  { name: "Collectors Demand", icon: Users },
  { name: "Significance", icon: Landmark },
  { name: "Artwork & Aesthetics", icon: Palette },
  { name: "Long-Term Collectibility", icon: Clock3 },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseScore(value: unknown): number | null {
  return parseScoreString(value);
}

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
  if (!Array.isArray(data.categories) || data.categories.length === 0) {
    return null;
  }

  const variantName = nonEmptyText(data.variant_name);
  const totalScore = parseScore(data.totalScore);
  const verdict = nonEmptyText(data.verdict);
  const overview = nonEmptyText(data.overview);
  const finalNote = data.finalNote;
  if (
    !variantName ||
    totalScore === null ||
    !verdict ||
    !overview ||
    !Array.isArray(finalNote) ||
    finalNote.length === 0 ||
    !finalNote.every(nonEmptyText)
  ) {
    return null;
  }

  const parsedCategories = data.categories.map((category) => {
    if (!isRecord(category)) return null;
    const name = nonEmptyText(category.name);
    const score = parseScore(category.score);
    const text = nonEmptyText(category.text);
    return name && score !== null && text ? { name, score, text } : null;
  });
  if (parsedCategories.some((category) => category === null)) {
    return null;
  }

  return {
    variantName,
    totalScore,
    verdict,
    overview,
    categories: parsedCategories as CollectorCategory[],
    finalNote: finalNote.map((paragraph) => paragraph.trim()),
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
  if (!Array.isArray(root.analyses) || root.analyses.length === 0) return null;
  const analyses = root.analyses.map((item) =>
    isRecord(item) ? parseCollectorAnalysisEntry(item) : null,
  );
  return analyses.every(
    (analysis): analysis is CollectorAnalysisData => analysis !== null,
  )
    ? analyses
    : null;
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

  if (loading)
    return <GrokLoadingState>Building collector report...</GrokLoadingState>;
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
  const totalScore = analysis.totalScore;
  const scoreTone = getScoreTone(totalScore);

  return (
    <div className="collector-ranking ui-render-fade">
      <fieldset
        aria-label="Collector analysis variant"
        className="collector-ranking__variant-selector radio-group variant-badge-group"
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
        <FeatureAnalysisHero
          badge={
            <Badge accent="blue" weight="strong">
              {scoreTone}
            </Badge>
          }
          eyebrow="Collector's score"
          headline={analysis.verdict}
          score={totalScore}
          scoreLabel="Overall collector score"
        >
          <p className="feature-analysis-summary feature-analysis-summary-text">
            {analysis.overview}
          </p>
        </FeatureAnalysisHero>

        <div className="collector-ranking__categories">
          {analysis.categories.map((category, index) => {
            const Icon =
              categories.find(({ name }) => name === category.name)?.icon ??
              Gem;
            const score = category.score;

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

        <section className="collector-ranking__conclusion collector-ranking__category default-container">
          <div className="feature-analysis-card-header">
            <h4>
              <FileText size={19} aria-hidden="true" />
              Overview
            </h4>
          </div>
          {analysis.finalNote.map((paragraph, index) => (
            <p key={`${paragraph}-${index}`}>{paragraph}</p>
          ))}
        </section>
      </div>
    </div>
  );
}
