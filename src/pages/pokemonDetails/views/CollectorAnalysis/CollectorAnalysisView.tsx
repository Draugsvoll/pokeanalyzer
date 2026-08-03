import {
  Clock3,
  Gem,
  Landmark,
  Palette,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { parseJsonText } from "../../../../utils/parseJsonText";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
import { FEATURE_ERROR_MESSAGE } from "../featureError";
import { LoadingState } from "../../../../components/loadingState/LoadingState";
import "./CollectorAnalysisView.scss";

type CollectorCategory = {
  name: string;
  score: string;
  text: string;
};

type CollectorAnalysisData = {
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

function parseCollectorAnalysis(
  response: string,
): CollectorAnalysisData | null {
  const value = parseJsonText(response);

  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const data = value as Record<string, unknown>;
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

  return {
    totalScore: String(data.totalScore ?? "0"),
    verdict: String(data.verdict ?? ""),
    overview: String(data.overview ?? ""),
    categories,
    finalNote: String(data.finalNote ?? ""),
  };
}

export default function CollectorAnalysis({
  grokRequest,
}: CollectorAnalysisProps) {
  const { loading, error, response } = grokRequest;

  if (loading) return <LoadingState>Building collector report...</LoadingState>;
  if (error)
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  if (!response) return null;

  const analysis = parseCollectorAnalysis(response);
  if (!analysis) {
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  }

  const totalScore = Math.min(
    100,
    Math.max(0, Number(analysis.totalScore) || 0),
  );

  return (
    <div className="collector-ranking ui-render-fade">
      <div className="collector-ranking__summary">
        <div
          className="collector-ranking__score"
          style={{ "--score": totalScore } as CSSProperties}
          role="img"
          aria-label={`Overall collector score: ${totalScore} out of 100`}
        >
          <div>
            <strong>{totalScore}</strong>
            <span>/100</span>
          </div>
        </div>
        <div className="collector-ranking__overview">
          <span>Overall score</span>
          {analysis.verdict && (
            <strong className="collector-ranking__verdict">
              {analysis.verdict}
            </strong>
          )}
          <h4>{analysis.overview}</h4>
        </div>
      </div>

      <div className="collector-ranking__categories">
        {analysis.categories.map((category, index) => {
          const Icon = categoryIcons[index] ?? Gem;
          const score = Math.min(100, Math.max(0, Number(category.score) || 0));

          return (
            <article
              key={`${category.name}-${index}`}
              className="collector-ranking__category"
            >
              <div className="collector-ranking__category-title">
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
        <section className="collector-ranking__conclusion">
          <h4>Conclusion</h4>
          <p>{analysis.finalNote}</p>
        </section>
      )}
    </div>
  );
}
