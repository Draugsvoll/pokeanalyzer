import { Badge } from "../../../../components/ui/Badge";
import { LoadingState } from "../../../../components/loadingState/LoadingState";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
import { parseJsonText } from "../../../../utils/parseJsonText";
import {
  FeatureAnalysisHero,
  FeatureAnalysisScoreMeter,
} from "../../components/FeatureAnalysisPanel";
import { FEATURE_ERROR_MESSAGE } from "../featureError";
import "./MarketAnalysisView.scss";

type JsonRecord = Record<string, unknown>;
type MarketSignal = { explanation: string; score: number; title: string };
type MarketOutlook = { explanation: string; label: string };

type MarketAnalysisData = {
  evidenceQuality: { reason: string; score: number };
  explanation: string;
  headline: string;
  marketBalance: string;
  outlook: {
    longTerm: MarketOutlook;
    nearTerm: MarketOutlook;
    risks: string[];
    upsideDrivers: string[];
  };
  score: number;
  signals: MarketSignal[];
  strongestSegment: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function textList(value: unknown) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function displayLabel(value: string) {
  return value.replaceAll("_", " ");
}

function displayLabelCapitalized(value: string) {
  const label = displayLabel(value);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function parseMarketScore(value: unknown) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 1 && value <= 100 ? value : null;
  }

  return typeof value === "string" && /^(?:[1-9]\d?|100)$/.test(value)
    ? Number(value)
    : null;
}

function parseMarketSignal(title: string, value: unknown) {
  if (!isRecord(value)) return null;

  const explanation = text(value.explanation);
  const score = parseMarketScore(value.score);
  return explanation && score !== null ? { explanation, score, title } : null;
}

function isMarketSignal(value: MarketSignal | null): value is MarketSignal {
  return value !== null;
}

function parseMarketOutlook(value: unknown): MarketOutlook | null {
  if (!isRecord(value)) return null;

  const explanation = text(value.explanation);
  const label = text(value.label);
  return explanation && label ? { explanation, label } : null;
}

function parseMarketAnalysis(response: string): MarketAnalysisData | null {
  const parsed = parseJsonText(response);
  if (!isRecord(parsed)) return null;

  const signals = isRecord(parsed.market_signals)
    ? parsed.market_signals
    : null;
  const outlook = isRecord(parsed.outlook) ? parsed.outlook : null;
  const evidenceQuality = isRecord(parsed.evidence_quality)
    ? parsed.evidence_quality
    : null;
  const score = parseMarketScore(parsed.score);
  const evidenceScore = parseMarketScore(evidenceQuality?.score);
  const nearTerm = parseMarketOutlook(outlook?.near_term);
  const longTerm = parseMarketOutlook(outlook?.long_term);
  const signalsToRender = [
    parseMarketSignal("Demand", signals?.demand),
    parseMarketSignal("Liquidity", signals?.liquidity),
    parseMarketSignal("Momentum", signals?.momentum),
    parseMarketSignal("Stability", signals?.stability),
  ];
  const parsedSignals = signalsToRender.filter(isMarketSignal);

  if (
    !signals ||
    !outlook ||
    !evidenceQuality ||
    score === null ||
    evidenceScore === null ||
    !nearTerm ||
    !longTerm ||
    parsedSignals.length !== 4
  ) {
    return null;
  }

  const data: MarketAnalysisData = {
    evidenceQuality: {
      reason: text(evidenceQuality.reason),
      score: evidenceScore,
    },
    explanation: text(parsed.explanation),
    headline: text(parsed.headline),
    marketBalance: text(parsed.market_balance),
    outlook: {
      longTerm,
      nearTerm,
      risks: textList(outlook.risks),
      upsideDrivers: textList(outlook.upside_drivers),
    },
    score,
    signals: parsedSignals,
    strongestSegment: text(parsed.strongest_segment),
  };

  return data.explanation &&
    data.headline &&
    data.marketBalance &&
    data.strongestSegment &&
    data.evidenceQuality.reason
    ? data
    : null;
}

function scoreAccent(score: number) {
  if (score <= 39) return "red" as const;
  if (score >= 70) return "green" as const;
  return "yellow" as const;
}

function outlookAccent(label: string) {
  if (label.includes("negative")) return "red" as const;
  if (label.includes("positive")) return "green" as const;
  return "yellow" as const;
}

function balanceAccent(balance: string) {
  if (balance === "balanced") return "green" as const;
  if (balance === "unclear") return "yellow" as const;
  return "orange" as const;
}

function TextList({ items }: { items: string[] }) {
  if (items.length === 0) return <span>None identified</span>;

  return (
    <ul>
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

export function MarketAnalysisView({
  grokRequest,
}: {
  grokRequest: GrokRequestState;
}) {
  const { error, loading, response } = grokRequest;

  if (loading) return <LoadingState>Building market report...</LoadingState>;
  if (error)
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  if (!response) return null;

  const data = parseMarketAnalysis(response);
  if (!data) {
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  }

  return (
    <section className="market-analysis-report ui-render-fade">
      <FeatureAnalysisHero
        eyebrow="Market Health"
        headline={data.headline}
        score={data.score}
        scoreLabel="Market health score"
      >
        <div className="market-analysis-report__overview-content">
          <p className="market-analysis-report__explanation">
            {data.explanation}
          </p>
          <div className="market-analysis-report__signals">
            {data.signals.map((signal) => (
              <section
                className="default-container-inner default-container-inner--centered"
                key={signal.title}
              >
                <Badge accent={scoreAccent(signal.score)} weight="strong">
                  {signal.title}: {signal.score}
                </Badge>
                <p className="market-analysis-report__signal-explanation">
                  {signal.explanation}
                </p>
              </section>
            ))}
          </div>
        </div>
      </FeatureAnalysisHero>

      <section className="market-analysis-report__summary-section default-container">
        <h3>Market summary</h3>
        <div className="market-analysis-report__summary-grid">
          <article className="default-container-inner default-container-inner--centered">
            <header className="market-analysis-report__summary-heading">
              <h4>Strongest segment</h4>
              <Badge accent="orange" weight="strong">
                {data.strongestSegment}
              </Badge>
            </header>
          </article>
          <article className="default-container-inner default-container-inner--centered">
            <header className="market-analysis-report__summary-heading">
              <h4>Buyer vs Seller</h4>
              <Badge accent={balanceAccent(data.marketBalance)} weight="strong">
                {displayLabelCapitalized(data.marketBalance)}
              </Badge>
            </header>
          </article>
          <article className="market-analysis-report__confidence default-container-inner default-container-inner--centered">
            <header className="feature-analysis-card-header">
              <FeatureAnalysisScoreMeter
                label="Analysis confidence score"
                score={data.evidenceQuality.score}
                showMaximum={false}
                size="icon"
              />
              <h4>Analysis confidence</h4>
            </header>
            <p>{data.evidenceQuality.reason}</p>
          </article>
        </div>
      </section>

      <article className="market-analysis-report__outlook default-container">
        <h3>Outlook</h3>
        <div className="market-analysis-report__outlook-grid">
          <section className="default-container-inner default-container-inner--centered">
            <header className="market-analysis-report__summary-heading">
              <h4>Near term</h4>
              <Badge
                accent={outlookAccent(data.outlook.nearTerm.label)}
                weight="strong"
              >
                {displayLabelCapitalized(data.outlook.nearTerm.label)}
              </Badge>
            </header>
            <p>{data.outlook.nearTerm.explanation}</p>
          </section>
          <section className="default-container-inner default-container-inner--centered">
            <header className="market-analysis-report__summary-heading">
              <h4>Long term</h4>
              <Badge
                accent={outlookAccent(data.outlook.longTerm.label)}
                weight="strong"
              >
                {displayLabelCapitalized(data.outlook.longTerm.label)}
              </Badge>
            </header>
            <p>{data.outlook.longTerm.explanation}</p>
          </section>
          <section className="default-container-inner default-container-inner--centered">
            <h4>Upside drivers</h4>
            <TextList items={data.outlook.upsideDrivers} />
          </section>
          <section className="default-container-inner default-container-inner--centered">
            <h4>Risks</h4>
            <TextList items={data.outlook.risks} />
          </section>
        </div>
      </article>
    </section>
  );
}
