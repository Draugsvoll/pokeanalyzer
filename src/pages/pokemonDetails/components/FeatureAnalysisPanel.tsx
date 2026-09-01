import type { CSSProperties, ReactNode } from "react";

type FeatureAnalysisScoreMeterSize = "default" | "small" | "icon";

type FeatureAnalysisScoreMeterProps = {
  label: string;
  score: number;
  showMaximum?: boolean;
  size?: FeatureAnalysisScoreMeterSize;
};

type FeatureAnalysisPanelProps = {
  badge?: ReactNode;
  eyebrow: string;
  headline?: string;
  score: number;
  scoreLabel: string;
  summary?: string;
};

export function FeatureAnalysisScoreMeter({
  label,
  score,
  showMaximum = true,
  size = "default",
}: FeatureAnalysisScoreMeterProps) {
  const sizeClassName =
    size === "default"
      ? ""
      : ` feature-analysis-score--${size === "small" ? "sm" : "icon"}`;

  return (
    <div
      aria-label={`${label}: ${score} out of 100`}
      className={`feature-analysis-score${sizeClassName}`}
      role="img"
      style={
        {
          "--feature-analysis-score-value": score,
        } as CSSProperties
      }
    >
      <div>
        <strong>{score}</strong>
        {showMaximum && <span>/100</span>}
      </div>
    </div>
  );
}

export function FeatureAnalysisPanel({
  badge,
  eyebrow,
  headline,
  score,
  scoreLabel,
  summary,
}: FeatureAnalysisPanelProps) {
  return (
    <section className="feature-analysis-accent-container">
      <div className="feature-analysis-score-block">
        <FeatureAnalysisScoreMeter label={scoreLabel} score={score} />
      </div>
      <div className="feature-analysis-summary-content">
        <div className="feature-analysis-summary-meta">
          <span className="feature-analysis-eyebrow">{eyebrow}</span>
          {badge}
        </div>
        {headline && (
          <strong className="feature-analysis-headline feature-analysis-summary-headline">
            {headline}
          </strong>
        )}
        {summary && (
          <p className="feature-analysis-summary feature-analysis-summary-text">
            {summary}
          </p>
        )}
      </div>
    </section>
  );
}
