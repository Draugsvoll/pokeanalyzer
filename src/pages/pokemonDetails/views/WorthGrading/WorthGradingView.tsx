import { CircleAlert, FileText, Scale } from "lucide-react";
import type { ReactNode } from "react";
import { LoadingState } from "../../../../components/loadingState/LoadingState";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
import { parseJsonText } from "../../../../utils/parseJsonText";
import { FEATURE_ERROR_MESSAGE } from "../featureError";
import "./WorthGradingView.scss";

type WorthGradingViewProps = {
  cardName: string;
  grokRequest: GrokRequestState;
};

type WorthGradingResponse = {
  conclusion: string;
  important_notes_and_caveats: string[] | string;
  key_reasons: string[] | string;
  potential_profit: ProfitLevel;
  realistic_profit: ProfitLevel;
};

const PROFIT_LEVELS = [
  "none",
  "low",
  "breakeven",
  "modest",
  "high",
  "very high",
] as const;

type ProfitLevel = (typeof PROFIT_LEVELS)[number];

const PROFIT_LEVEL_SET = new Set<string>(PROFIT_LEVELS);

function normalizeProfitLevel(value: unknown): ProfitLevel | null {
  if (typeof value !== "string") return null;

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  return PROFIT_LEVEL_SET.has(normalized) ? (normalized as ProfitLevel) : null;
}

function parseWorthGradingResponse(response: string) {
  const parsed = parseJsonText(response);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const data = parsed as Record<string, unknown>;
  const potentialProfit = normalizeProfitLevel(data.potential_profit);
  const realisticProfit = normalizeProfitLevel(data.realistic_profit);

  if (
    typeof data.conclusion !== "string" ||
    !potentialProfit ||
    !realisticProfit
  ) {
    return null;
  }

  return {
    ...data,
    potential_profit: potentialProfit,
    realistic_profit: realisticProfit,
  } as WorthGradingResponse;
}

function asList(value: string[] | string) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function getPotentialProfitLabel(value: WorthGradingResponse["potential_profit"]) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getPotentialProfitTone(value: WorthGradingResponse["potential_profit"]) {
  if (value === "none") return "negative";
  if (value === "low" || value === "breakeven" || value === "modest") {
    return "caution";
  }
  return "positive";
}

function TextList({
  icon,
  items,
  title,
}: {
  icon: ReactNode;
  items: string[];
  title: string;
}) {
  if (!items.length) return null;

  return (
    <section className="worth-grading-view__detail-section feature-card-inner-surface">
      <h3>
        {icon}
        {title}
      </h3>
      <ul>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function WorthGradingView({
  cardName,
  grokRequest,
}: WorthGradingViewProps) {
  const { loading, error, response } = grokRequest;

  if (loading) return <LoadingState>Researching grading value...</LoadingState>;
  if (error) return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  if (!response) return null;

  const data = parseWorthGradingResponse(response);
  if (!data) return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;

  return (
    <section className="worth-grading-view ui-render-fade">
      <article className="worth-grading-view__card feature-card-surface">
        <header className="feature-panel-header worth-grading-view__header">
          <div>
            <h2 className="feature-section-heading">Grading Recommendation</h2>
            <p>{cardName}</p>
          </div>
        </header>

        <div className="feature-panel-body worth-grading-view__body">
          <div className="worth-grading-view__badges">
            <div
              className={`worth-grading-view__recommendation worth-grading-view__recommendation--${getPotentialProfitTone(
                data.realistic_profit,
            )}`}
            >
              Realistic: {getPotentialProfitLabel(data.realistic_profit)}
            </div>
            <div
              className={`worth-grading-view__recommendation worth-grading-view__recommendation--${getPotentialProfitTone(
                data.potential_profit,
              )}`}
            >
              Potential: {getPotentialProfitLabel(data.potential_profit)}
            </div>
          </div>

          <section className="worth-grading-view__summary feature-card-inner-surface">
            <h3>
              <Scale aria-hidden="true" size={18} strokeWidth={2.1} />
              Conclusion
            </h3>
            <p>{data.conclusion}</p>
          </section>

          <div className="worth-grading-view__details">
            <TextList
              icon={<FileText aria-hidden="true" size={18} strokeWidth={2.1} />}
              items={asList(data.key_reasons)}
              title="Key reasons"
            />
            <TextList
              icon={<CircleAlert aria-hidden="true" size={18} strokeWidth={2.1} />}
              items={asList(data.important_notes_and_caveats)}
              title="Important notes"
            />
          </div>
        </div>
      </article>
    </section>
  );
}
