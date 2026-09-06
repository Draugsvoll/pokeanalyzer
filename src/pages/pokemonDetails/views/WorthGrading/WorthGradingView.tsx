import { ChevronDown, Layers3, Scale } from "lucide-react";
import { useState, type ReactNode } from "react";
import { LoadingState } from "../../../../components/loadingState/LoadingState";
import { Badge } from "../../../../components/ui/Badge";
import { FeatureAnalysisScoreMeter } from "../../components/FeatureAnalysisPanel";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
import { parseJsonText } from "../../../../utils/parseJsonText";
import { FEATURE_ERROR_MESSAGE } from "../featureError";
import "./WorthGradingView.scss";

type WorthGradingViewProps = {
  grokRequest: GrokRequestState;
};

type CardInfo = {
  name?: string | null;
  number?: string | null;
  set?: string | null;
  variant_name?: string | null;
  year?: number | string | null;
};

type RawSaleToday = {
  estimated_fees_usd?: number | string | null;
  gross_sale_usd?: number | string | null;
  net_proceeds_usd?: number | string | null;
  time_to_sell?: string | null;
};

type GradedScenario = {
  ebay_fee_model?: string | null;
  ebay_fees_usd?: number | string | null;
  expected_sale_price_usd?: number | string | null;
  grade?: string | null;
  grading_tier?: string | null;
  grading_tier_justification?: string | null;
  net_profit_vs_raw_usd?: number | string | null;
  psa_grading_fee_usd?: number | string | null;
  psa_note?: string | null;
  roi_vs_raw_net_percent?: number | string | null;
  shipping_and_insurance_usd?: number | string | null;
  turnaround_time?: string | null;
};

type PsaPopulation = {
  source?: string | null;
  psa_population_psa6?: number | string | null;
  psa_population_psa7?: number | string | null;
  psa_population_psa8?: number | string | null;
  psa_population_psa9?: number | string | null;
  psa_population_psa10?: number | string | null;
  psa_population_total?: number | string | null;
};

type ConfidenceLevel = {
  reasoning?: string | null;
  score?: string | null;
};

type AttractivenessLevel = {
  reasoning?: string[] | null;
  score?: string | null;
};

type Recommendation = {
  bottom_line?: string | null;
  headline?: string | null;
  notes?: string[] | null;
  potential?: string | null;
};

type WorthGradingVariant = {
  assumptions?: unknown;
  attractiveness_level?: AttractivenessLevel;
  card?: CardInfo;
  confidence_level?: ConfidenceLevel;
  graded_scenarios?: unknown;
  psa_population?: PsaPopulation;
  raw_sale_today?: RawSaleToday;
  recommendation?: Recommendation;
};

type WorthGradingResponse = {
  variants?: unknown;
};

const EMPTY_VALUE = "-";

function formatPotentialLabel(potential: string) {
  return potential
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getPotentialBadgeAccent(potential: string) {
  switch (potential.trim().toLowerCase()) {
    case "negative":
    case "none":
    case "very low":
      return "red";
    case "marginal":
    case "modest":
      return "yellow";
    case "good":
      return "teal";
    case "high":
    case "very high":
      return "green";
    default:
      return "neutral";
  }
}

function parseWorthGradingResponse(response: string) {
  const parsed = parseJsonText(response);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return null;
  return parsed as WorthGradingResponse;
}

function asStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function getSafeExternalUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

type TitledDetail = {
  text: string;
  title: string;
};

function asTitledDetails(
  value: unknown,
  textField: "assumption" | "reason",
): TitledDetail[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];

    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const text =
      typeof record[textField] === "string" ? record[textField].trim() : "";

    return title && text ? [{ text, title }] : [];
  });
}

function asNumber(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const normalized = value
    .trim()
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/[()]/g, "")
    .replace(/[$€£¥,%]/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, "");
  const number = Number(normalized);

  return Number.isFinite(number) ? number : null;
}

function hasParenthesizedNumber(value: unknown) {
  return typeof value === "string" && /^\s*\(.+\)\s*$/.test(value);
}

function displayValue(value: unknown) {
  if (typeof value === "string") return value.trim() || EMPTY_VALUE;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return EMPTY_VALUE;
}

function formatCurrency(value: unknown) {
  const number = asNumber(value);
  if (number == null) return EMPTY_VALUE;

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(number);
}

function formatPercent(value: unknown) {
  const number = asNumber(value);
  if (number == null) return EMPTY_VALUE;
  return `${number.toFixed(1)}%`;
}

function formatRoi(value: unknown) {
  const percent = formatPercent(value);
  return percent === EMPTY_VALUE ? EMPTY_VALUE : `${percent} ROI`;
}

function formatNumber(value: unknown) {
  const number = asNumber(value);
  if (number == null) return EMPTY_VALUE;

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(number);
}

function formatProfit(value: unknown) {
  const number = asNumber(value);
  if (number == null) return EMPTY_VALUE;
  if (hasParenthesizedNumber(value)) return formatCurrency(number);
  return `${number > 0 ? "+" : ""}${formatCurrency(number)}`;
}

function formatCost(value: unknown) {
  const number = asNumber(value);
  if (number == null) return EMPTY_VALUE;
  return `-${formatCurrency(Math.abs(number))}`;
}

function getNumberTone(value: unknown) {
  if (hasParenthesizedNumber(value)) return undefined;

  const number = asNumber(value);
  if (number == null || number === 0) return undefined;
  return number < 0 ? "negative" : "positive";
}

function isScenario(value: unknown): value is GradedScenario {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isVariant(value: unknown): value is WorthGradingVariant {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function FieldCard({
  children,
  label,
  tone,
}: {
  children: ReactNode;
  label: string;
  tone?: "negative" | "positive";
}) {
  return (
    <div className="worth-grading-view__metric default-container-inner">
      <span>{label}</span>
      <strong
        className={
          tone
            ? `worth-grading-view__field-value worth-grading-view__field-value--${tone}`
            : "worth-grading-view__field-value"
        }
      >
        {children}
      </strong>
    </div>
  );
}

function RawSaleCard({ rawSale }: { rawSale: RawSaleToday }) {
  const proceedsTone = getNumberTone(rawSale.net_proceeds_usd);
  const costTone = "negative" as const;

  return (
    <section className="worth-grading-view__scenario worth-grading-view__scenario--static">
      <div className="worth-grading-view__scenario-profit">
        <h2>Raw</h2>
        <div className="worth-grading-view__profit-value">
          <strong
            className={
              proceedsTone
                ? `worth-grading-view__field-value worth-grading-view__field-value--${proceedsTone}`
                : "worth-grading-view__field-value"
            }
          >
            {formatCurrency(rawSale.net_proceeds_usd)}
          </strong>
          <small>Net proceeds</small>
        </div>
      </div>
      <div className="worth-grading-view__scenario-breakdown">
        <div className="worth-grading-view__cost-group">
          <CostRow label="Expected Sell Price">
            {formatCurrency(rawSale.gross_sale_usd)}
          </CostRow>
        </div>
        <div className="worth-grading-view__cost-group">
          <CostRow label="eBay Fees" tone={costTone}>
            {formatCost(rawSale.estimated_fees_usd)}
          </CostRow>
        </div>
        <div className="worth-grading-view__cost-group">
          <CostRow label="Net Proceeds" tone={proceedsTone}>
            {formatCurrency(rawSale.net_proceeds_usd)}
          </CostRow>
        </div>
      </div>
      <div className="worth-grading-view__scenario-support">
        <FieldCard label="eBay sell time">
          {displayValue(rawSale.time_to_sell)}
        </FieldCard>
      </div>
    </section>
  );
}

function CostRow({
  children,
  label,
  tone,
}: {
  children: ReactNode;
  label: ReactNode;
  tone?: "negative" | "positive";
}) {
  return (
    <div className="worth-grading-view__cost-row">
      <div className="worth-grading-view__cost-label">{label}</div>
      <strong
        className={
          tone
            ? `worth-grading-view__field-value worth-grading-view__field-value--${tone}`
            : "worth-grading-view__field-value"
        }
      >
        {children}
      </strong>
    </div>
  );
}

function ScenarioCard({
  rawNetProceeds,
  scenario,
}: {
  rawNetProceeds: unknown;
  scenario: GradedScenario;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const profitTone = getNumberTone(scenario.net_profit_vs_raw_usd);
  const costTone = "negative" as const;

  return (
    <section className="worth-grading-view__scenario">
      <div className="worth-grading-view__scenario-profit">
        <h2>{displayValue(scenario.grade)}</h2>
        <div className="worth-grading-view__profit-value">
          <strong
            className={
              profitTone
                ? `worth-grading-view__field-value worth-grading-view__field-value--${profitTone}`
                : "worth-grading-view__field-value"
            }
          >
            {formatProfit(scenario.net_profit_vs_raw_usd)}
          </strong>
          <small
            className={
              profitTone
                ? `worth-grading-view__field-value worth-grading-view__field-value--${profitTone}`
                : "worth-grading-view__field-value"
            }
          >
            {formatRoi(scenario.roi_vs_raw_net_percent)}
          </small>
        </div>
        <button
          className="worth-grading-view__details-toggle"
          onClick={() => setDetailsOpen((open) => !open)}
          data-open={detailsOpen}
          type="button"
        >
          {detailsOpen ? "Hide details" : "Show details"}
        </button>
      </div>

      {detailsOpen && (
        <>
          <div className="worth-grading-view__scenario-breakdown">
            <div className="worth-grading-view__cost-group">
              <CostRow label="Expected Sell Price">
                {formatCurrency(scenario.expected_sale_price_usd)}
              </CostRow>
            </div>
            <div className="worth-grading-view__cost-group">
              <CostRow label="PSA Grading Fee" tone={costTone}>
                {formatCost(scenario.psa_grading_fee_usd)}
              </CostRow>
              <CostRow label="Shipping & Insurance" tone={costTone}>
                {formatCost(scenario.shipping_and_insurance_usd)}
              </CostRow>
              <CostRow
                label={
                  scenario.ebay_fee_model?.trim() ? (
                    <details className="worth-grading-view__fee-model">
                      <summary>eBay Fees</summary>
                      <p className="worth-grading-view__cost-note">
                        {scenario.ebay_fee_model}
                      </p>
                    </details>
                  ) : (
                    "eBay Fees"
                  )
                }
                tone={costTone}
              >
                {formatCost(scenario.ebay_fees_usd)}
              </CostRow>
              <CostRow
                label={
                  <>
                    Raw net proceeds
                    <p className="worth-grading-view__cost-note">
                      Profits if you sold raw (incl. eBay fees)
                    </p>
                  </>
                }
                tone={costTone}
              >
                {formatCost(rawNetProceeds)}
              </CostRow>
            </div>
            <div className="worth-grading-view__cost-group">
              <CostRow label="Net incremental gain" tone={profitTone}>
                {formatProfit(scenario.net_profit_vs_raw_usd)}
              </CostRow>
            </div>
          </div>

          <div className="worth-grading-view__scenario-support">
            <div className="worth-grading-view__scenario-meta">
              <FieldCard label="turnaround">
                {displayValue(scenario.turnaround_time)}
              </FieldCard>
              <div className="worth-grading-view__metric worth-grading-view__tier-metric default-container-inner">
                <span>grading tier</span>
                <div>
                  <strong>{displayValue(scenario.grading_tier)}</strong>
                  <small>{formatCurrency(scenario.psa_grading_fee_usd)}</small>
                </div>
              </div>
            </div>
            {scenario.grading_tier_justification?.trim() && (
              <div className="worth-grading-view__tier-justification default-container-inner">
                <span>Why this grading tier</span>
                <p>{scenario.grading_tier_justification}</p>
              </div>
            )}
            {scenario.psa_note?.trim() && (
              <p className="worth-grading-view__psa-note default-container-inner">
                {scenario.psa_note}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function PsaPopulationCard({ population }: { population?: PsaPopulation }) {
  const sourceUrl = getSafeExternalUrl(population?.source);
  const totalPopulation = asNumber(population?.psa_population_total);
  const reportedGradeCounts = [
    ["PSA 10", population?.psa_population_psa10],
    ["PSA 9", population?.psa_population_psa9],
    ["PSA 8", population?.psa_population_psa8],
    ["PSA 7", population?.psa_population_psa7],
    ["PSA 6", population?.psa_population_psa6],
  ] as const;
  const reportedPopulation = reportedGradeCounts.reduce(
    (sum, [, value]) => sum + (asNumber(value) ?? 0),
    0,
  );
  const hasAllReportedCounts = reportedGradeCounts.every(
    ([, value]) => asNumber(value) != null,
  );
  const belowPsa6Population =
    totalPopulation == null || !hasAllReportedCounts
      ? null
      : Math.max(0, totalPopulation - reportedPopulation);
  const gradeCounts = [
    ...reportedGradeCounts,
    ["< PSA 6", belowPsa6Population] as const,
  ];

  return (
    <article className="worth-grading-view__population-card default-container-inner">
      <div className="worth-grading-view__population-total">
        <span>Total Population</span>
        <strong>{formatNumber(population?.psa_population_total)}</strong>
      </div>
      <div className="worth-grading-view__population-grades">
        {gradeCounts.map(([label, value]) => {
          const count = asNumber(value);
          const hasPercentage =
            count != null && totalPopulation != null && totalPopulation > 0;
          const percentage = hasPercentage
            ? Math.min(100, Math.max(0, (count / totalPopulation) * 100))
            : null;

          return (
            <div className="worth-grading-view__population-grade" key={label}>
              <div>
                <span>{label}</span>
                <strong>{formatNumber(value)}</strong>
              </div>
              <div
                aria-label={
                  hasPercentage
                    ? `${label} population: ${formatNumber(value)} of ${formatNumber(population?.psa_population_total)}`
                    : undefined
                }
                aria-valuemax={hasPercentage ? 100 : undefined}
                aria-valuemin={hasPercentage ? 0 : undefined}
                aria-valuenow={percentage ?? undefined}
                className="worth-grading-view__population-track"
                role={hasPercentage ? "progressbar" : undefined}
              >
                {percentage != null && (
                  <span style={{ width: `${percentage}%` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {sourceUrl && (
        <a
          className="worth-grading-view__population-source"
          href={sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          View PSA Population Report
        </a>
      )}
    </article>
  );
}

function CollapsibleTitledDetailList({
  items = [],
  notes = [],
  title,
}: {
  items?: TitledDetail[];
  notes?: string[];
  title: string;
}) {
  if (!items.length && !notes.length) return null;

  return (
    <details className="worth-grading-view__collapsible-details default-container">
      <summary>
        <h3>{title}</h3>
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="worth-grading-view__collapsible-content">
        <ul>
          {items.map((item, index) => (
            <li key={`${item.title}-${index}`}>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
            </li>
          ))}
        </ul>
        {notes.length > 0 && (
          <section className="worth-grading-view__collapsible-notes">
            <ul>
              {notes.map((note, index) => (
                <li
                  className="default-container-inner"
                  key={`${note}-${index}`}
                >
                  <p>{note}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </details>
  );
}

export function WorthGradingView({ grokRequest }: WorthGradingViewProps) {
  const { loading, error, response } = grokRequest;
  const [selectedVariant, setSelectedVariant] = useState({
    index: 0,
    responseKey: "",
  });

  if (loading) return <LoadingState>Researching value...</LoadingState>;
  if (error)
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  if (!response) return null;

  const responseKey = response;
  const data = parseWorthGradingResponse(response);
  if (!data)
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;

  const variants = Array.isArray(data.variants)
    ? data.variants.filter(isVariant)
    : [];
  if (!variants.length)
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;

  const selectedVariantIndex =
    selectedVariant.responseKey === responseKey ? selectedVariant.index : 0;
  const activeVariantIndex = variants[selectedVariantIndex]
    ? selectedVariantIndex
    : 0;
  const activeVariant = variants[activeVariantIndex];
  const assumptions = asTitledDetails(activeVariant.assumptions, "assumption");
  const scenarios = Array.isArray(activeVariant.graded_scenarios)
    ? activeVariant.graded_scenarios.filter(isScenario)
    : [];
  const recommendation = activeVariant.recommendation;
  const notes = asStringList(recommendation?.notes);
  const confidence = activeVariant.confidence_level;
  const confidenceScoreValue = asNumber(confidence?.score);
  const confidenceScore =
    confidenceScoreValue == null
      ? null
      : Math.min(100, Math.max(0, confidenceScoreValue));
  const attractiveness = activeVariant.attractiveness_level;
  const attractivenessReasoning = asStringList(attractiveness?.reasoning);
  const attractivenessScoreValue = asNumber(attractiveness?.score);
  const attractivenessScore =
    attractivenessScoreValue == null
      ? null
      : Math.min(100, Math.max(0, attractivenessScoreValue));
  const rawSale = activeVariant.raw_sale_today;
  const hasRawSale = Boolean(
    rawSale &&
    Object.values(rawSale).some(
      (value) => value != null && String(value).trim().length > 0,
    ),
  );

  return (
    <section className="worth-grading-view ui-render-fade">
      <article className="worth-grading-view__card">
        <div className="worth-grading-view__body">
          <fieldset
            aria-label="Grading recommendation variant"
            className="worth-grading-view__variant-selector radio-group variant-badge-group"
          >
            <div>
              {variants.map((variant, variantIndex) => {
                const variantName =
                  variant.card?.variant_name ||
                  variant.card?.name ||
                  `Variant ${variantIndex + 1}`;

                return (
                  <label key={`${variantName}-${variantIndex}`}>
                    <input
                      checked={activeVariantIndex === variantIndex}
                      name="worth-grading-variant"
                      onChange={() =>
                        setSelectedVariant({
                          index: variantIndex,
                          responseKey,
                        })
                      }
                      type="radio"
                      value={variantIndex}
                    />
                    <span>
                      <Layers3 aria-hidden="true" />
                      <strong>{variantName}</strong>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div
            className="worth-grading-view__variant-content ui-render-fade"
            key={`${responseKey}-${activeVariantIndex}`}
          >
            {(recommendation?.potential?.trim() ||
              recommendation?.headline?.trim() ||
              attractivenessReasoning.length > 0 ||
              attractivenessScore != null) && (
              <section className="worth-grading-view__overview default-container">
                <span className="worth-grading-view__overview-eyebrow">
                  Overall Score
                </span>
                {attractivenessScore != null && (
                  <div className="feature-analysis-score-block">
                    <FeatureAnalysisScoreMeter
                      label="Grading attractiveness score"
                      score={attractivenessScore}
                      size="large"
                    />
                  </div>
                )}
                {recommendation?.potential?.trim() && (
                  <div className="worth-grading-view__overview-badge">
                    <Badge
                      accent={getPotentialBadgeAccent(recommendation.potential)}
                      weight="strong"
                    >
                      {formatPotentialLabel(recommendation.potential)} max
                      profit
                    </Badge>
                  </div>
                )}
                {recommendation?.headline?.trim() && (
                  <strong className="worth-grading-view__overview-headline">
                    {recommendation.headline}
                  </strong>
                )}
                {attractivenessReasoning.length > 0 && (
                  <div className="worth-grading-view__overview-reasoning">
                    {attractivenessReasoning.map((paragraph, index) => (
                      <p key={`${paragraph}-${index}`}>{paragraph}</p>
                    ))}
                  </div>
                )}
              </section>
            )}
            {(scenarios.length > 0 || hasRawSale) && (
              <section className="worth-grading-view__json-section default-container">
                <h3 className="worth-grading-view__section-title">
                  Calculations
                </h3>
                <div className="worth-grading-view__scenario-grid">
                  {scenarios.map((scenario, index) => (
                    <ScenarioCard
                      key={`${scenario.grade ?? "scenario"}-${index}`}
                      rawNetProceeds={
                        activeVariant.raw_sale_today?.net_proceeds_usd
                      }
                      scenario={scenario}
                    />
                  ))}
                  {hasRawSale && rawSale && <RawSaleCard rawSale={rawSale} />}
                </div>
              </section>
            )}
            {(recommendation?.bottom_line?.trim() ||
              confidenceScore != null ||
              confidence?.reasoning?.trim()) && (
              <section className="worth-grading-view__decision-summary default-container">
                <h3 className="worth-grading-view__section-title">Summary</h3>
                <div className="worth-grading-view__decision-summary-content">
                  {recommendation?.bottom_line?.trim() && (
                    <section className="worth-grading-view__decision-summary-item default-container-inner">
                      <div className="feature-analysis-card-header">
                        <h4>
                          <Scale aria-hidden="true" />
                          Recommendation
                        </h4>
                      </div>
                      <p>{recommendation.bottom_line}</p>
                    </section>
                  )}
                  {(confidenceScore != null ||
                    confidence?.reasoning?.trim()) && (
                    <section className="worth-grading-view__decision-summary-item default-container-inner">
                      <div className="feature-analysis-card-header">
                        {confidenceScore != null && (
                          <FeatureAnalysisScoreMeter
                            label="Confidence score"
                            score={confidenceScore}
                            showMaximum={false}
                            size="icon"
                          />
                        )}
                        <h4>Analysis confidence</h4>
                      </div>
                      {confidence?.reasoning?.trim() && (
                        <p>{confidence.reasoning}</p>
                      )}
                    </section>
                  )}
                </div>
              </section>
            )}

            <CollapsibleTitledDetailList
              notes={notes}
              title="Additional considerations"
            />

            <CollapsibleTitledDetailList
              items={assumptions}
              title="Assumptions"
            />

            <section className="worth-grading-view__json-section default-container">
              <h3 className="worth-grading-view__section-title">
                PSA Population
              </h3>
              <PsaPopulationCard population={activeVariant.psa_population} />
            </section>
          </div>
        </div>
      </article>
    </section>
  );
}
