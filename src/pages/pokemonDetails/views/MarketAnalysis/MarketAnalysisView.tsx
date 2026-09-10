import { Badge } from "../../../../components/ui/Badge";
import { LoadingState } from "../../../../components/loadingState/LoadingState";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
import { parseJsonText } from "../../../../utils/parseJsonText";
import { FeatureAnalysisHero } from "../../components/FeatureAnalysisPanel";
import { FEATURE_ERROR_MESSAGE } from "../featureError";
import "./MarketAnalysisView.scss";

type JsonRecord = Record<string, unknown>;
type MarketSignal = { label: string; reasoning: string; title: string };

type MarketAnalysisData = {
  balance: { reason: string; state: string };
  evidenceQuality: { confidence: string; reason: string };
  marketPulse: string;
  outlook: {
    longTerm: string;
    nearTerm: string;
    risks: string[];
    summary: string;
    upsideDrivers: string[];
  };
  sentiment: { label: string; score: number; summary: string };
  signals: MarketSignal[];
  strongestSegment: { label: string; reason: string };
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

function displaySignalLabel(value: string) {
  const label = displayLabel(value);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function parseMarketSentimentScore(value: unknown) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 1 && value <= 100 ? value : null;
  }

  return typeof value === "string" && /^(?:[1-9]\d?|100)$/.test(value)
    ? Number(value)
    : null;
}

function parseMarketSignal(title: string, value: unknown) {
  if (!isRecord(value)) return null;

  const label = text(value.label);
  const reasoning = text(value.reasoning);
  return label && reasoning ? { label, reasoning, title } : null;
}

function isMarketSignal(value: MarketSignal | null): value is MarketSignal {
  return value !== null;
}

function parseMarketAnalysis(response: string): MarketAnalysisData | null {
  const parsed = parseJsonText(response);
  if (!isRecord(parsed)) return null;

  const sentiment = isRecord(parsed.market_sentiment)
    ? parsed.market_sentiment
    : null;
  const signals = isRecord(parsed.market_signals)
    ? parsed.market_signals
    : null;
  const strongestSegment = isRecord(parsed.strongest_segment)
    ? parsed.strongest_segment
    : null;
  const balance = isRecord(parsed.market_balance)
    ? parsed.market_balance
    : null;
  const outlook = isRecord(parsed.outlook) ? parsed.outlook : null;
  const evidenceQuality = isRecord(parsed.evidence_quality)
    ? parsed.evidence_quality
    : null;
  const card = isRecord(parsed.card) ? parsed.card : null;
  const score = parseMarketSentimentScore(sentiment?.score);
  const signalsToRender = [
    parseMarketSignal("Demand", signals?.demand),
    parseMarketSignal("Liquidity", signals?.liquidity),
    parseMarketSignal("Momentum", signals?.momentum),
    parseMarketSignal("Volatility", signals?.volatility),
  ];
  const parsedSignals = signalsToRender.filter(isMarketSignal);

  if (
    !card ||
    !text(card.name) ||
    !text(card.set) ||
    !text(card.number) ||
    !text(card.variant) ||
    !sentiment ||
    !signals ||
    !strongestSegment ||
    !balance ||
    !outlook ||
    !evidenceQuality ||
    score === null ||
    parsedSignals.length !== 4
  ) {
    return null;
  }

  const data: MarketAnalysisData = {
    balance: {
      reason: text(balance.reason),
      state: text(balance.state),
    },
    evidenceQuality: {
      confidence: text(evidenceQuality.confidence),
      reason: text(evidenceQuality.reason),
    },
    marketPulse: text(parsed.market_pulse),
    outlook: {
      longTerm: text(outlook.long_term),
      nearTerm: text(outlook.near_term),
      risks: textList(outlook.risks),
      summary: text(outlook.summary),
      upsideDrivers: textList(outlook.upside_drivers),
    },
    sentiment: {
      label: text(sentiment.label),
      score,
      summary: text(sentiment.summary),
    },
    signals: parsedSignals,
    strongestSegment: {
      label: text(strongestSegment.label),
      reason: text(strongestSegment.reason),
    },
  };

  return data.sentiment.label && data.marketPulse ? data : null;
}

function signalAccent(label: string) {
  if (label.includes("low")) return "red" as const;
  if (label.includes("high")) return "green" as const;
  return "yellow" as const;
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
        headline={data.sentiment.summary}
        score={data.sentiment.score}
        scoreLabel="Market sentiment score"
      >
        <div className="market-analysis-report__overview-content">
          <div className="market-analysis-report__signals">
            {data.signals.map((signal) => (
              <section className="default-container-inner" key={signal.title}>
                <Badge accent={signalAccent(signal.label)} weight="strong">
                  {displaySignalLabel(signal.label)} {signal.title}
                </Badge>
                <p className="market-analysis-report__signal-reasoning">
                  {signal.reasoning}
                </p>
              </section>
            ))}
          </div>
        </div>
      </FeatureAnalysisHero>

      <section className="market-analysis-report__summary-section default-container">
        <h3>Summary</h3>
        <div className="market-analysis-report__summary-grid">
          <article className="default-container-inner">
            <header className="market-analysis-report__summary-heading">
              <h4>Strongest segment</h4>
              <Badge accent="orange" weight="strong">
                {data.strongestSegment.label}
              </Badge>
            </header>
            <p>{data.strongestSegment.reason}</p>
          </article>
          <article className="default-container-inner">
            <header className="market-analysis-report__summary-heading">
              <h4>Buyer vs Seller</h4>
              <Badge accent="orange" weight="strong">
                {displaySignalLabel(data.balance.state)}
              </Badge>
            </header>
            <p>{data.balance.reason}</p>
          </article>
          <article className="default-container-inner">
            <header className="market-analysis-report__summary-heading">
              <h4>Market behaviour</h4>
            </header>
            <p>{data.marketPulse}</p>
          </article>
          <article className="default-container-inner">
            <header className="market-analysis-report__summary-heading">
              <h4>Analysis quality</h4>
            </header>
            <p>{data.evidenceQuality.reason}</p>
          </article>
        </div>
      </section>

      <article className="market-analysis-report__outlook default-container">
        <h3>Outlook</h3>
        <div className="market-analysis-report__outlook-summary">
          <div className="market-analysis-report__outlook-labels">
            <Badge>Near term: {displayLabel(data.outlook.nearTerm)}</Badge>
            <Badge>Long term: {displayLabel(data.outlook.longTerm)}</Badge>
          </div>
          <p>{data.outlook.summary}</p>
        </div>
        <div className="market-analysis-report__drivers">
          <section className="default-container-inner">
            <h4>Upside drivers</h4>
            <TextList items={data.outlook.upsideDrivers} />
          </section>
          <section className="default-container-inner">
            <h4>Risks</h4>
            <TextList items={data.outlook.risks} />
          </section>
        </div>
      </article>
    </section>
  );
}
