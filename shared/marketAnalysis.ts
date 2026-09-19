import { isScoreNumber } from "./analysisScores.js";

type JsonRecord = Record<string, unknown>;

export type MarketAnalysisLabelExplanation = {
  explanation: string;
  label: string;
};

export type MarketAnalysisSignal = MarketAnalysisLabelExplanation & {
  score: number;
  title: string;
};

export type MarketAnalysisData = {
  eyesOn: MarketAnalysisLabelExplanation | null;
  headline: string;
  healthiestSegment: MarketAnalysisLabelExplanation;
  marketBalance: MarketAnalysisLabelExplanation;
  outlook: {
    longTerm: MarketAnalysisLabelExplanation;
    nearTerm: MarketAnalysisLabelExplanation;
    risks: string[];
    upsideDrivers: string[];
  };
  priceDiscovery: MarketAnalysisLabelExplanation;
  score: number;
  setName: string;
  signals: MarketAnalysisSignal[];
  variantName: string;
};

const unavailable = {
  explanation: "No market analysis was provided for this section.",
  label: "Not provided",
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter(Boolean);
}

function parseLabelExplanation(
  value: unknown,
): MarketAnalysisLabelExplanation | null {
  if (!isRecord(value)) return null;

  const label = text(value.label);
  const explanation = text(value.explanation);
  if (!label || !explanation) return null;
  return { explanation, label };
}

function parseSignal(title: string, value: unknown) {
  if (!isRecord(value) || !isScoreNumber(value.score)) return null;
  const explanation = text(value.explanation);
  return explanation ? { explanation, score: value.score, title } : null;
}

export function parseMarketAnalysisResponse(
  response: unknown,
): MarketAnalysisData | null {
  let parsed: unknown = response;
  if (typeof response === "string") {
    try {
      parsed = JSON.parse(response) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(parsed)) return null;

  const setName = text(parsed.set_name);
  const variantName = text(parsed.variant_name);
  const headline = text(parsed.headline);
  const score = isScoreNumber(parsed.score) ? parsed.score : null;
  const signals = isRecord(parsed.market_signals)
    ? parsed.market_signals
    : null;
  const outlook = isRecord(parsed.outlook) ? parsed.outlook : null;
  const healthiestSegment =
    parseLabelExplanation(parsed.healthiest_segment) ?? unavailable;
  const marketBalance =
    parseLabelExplanation(parsed.market_balance) ?? unavailable;
  const priceDiscovery =
    parseLabelExplanation(parsed.price_discovery) ?? unavailable;
  const nearTerm = parseLabelExplanation(outlook?.near_term) ?? unavailable;
  const longTerm = parseLabelExplanation(outlook?.long_term) ?? unavailable;
  const upsideDrivers = parseTextList(outlook?.upside_drivers);
  const risks = parseTextList(outlook?.risks);
  const parsedSignals = signals
    ? [
        parseSignal("Demand", signals.demand),
        parseSignal("Liquidity", signals.liquidity),
        parseSignal("Stability", signals.stability),
        parseSignal("Momentum", signals.momentum),
      ].filter((signal): signal is MarketAnalysisSignal => signal !== null)
    : [];
  const eyesOn = parseLabelExplanation(parsed.eyes_on);

  if (!headline || score === null || parsedSignals.length === 0) {
    return null;
  }

  return {
    eyesOn,
    headline,
    healthiestSegment,
    marketBalance,
    outlook: { longTerm, nearTerm, risks, upsideDrivers },
    priceDiscovery,
    score,
    setName: setName || "Unknown set",
    signals: parsedSignals,
    variantName: variantName || "Unknown variant",
  };
}
