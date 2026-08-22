import { Layers3 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { LoadingState } from "../../../../components/loadingState/LoadingState";
import { Badge } from "../../../../components/ui/Badge";
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
  ebay_fees_usd?: number | string | null;
  expected_sale_price_usd?: number | string | null;
  grade?: string | null;
  grading_tier?: string | null;
  grading_tier_justification?: string | null;
  net_after_all_costs_usd?: number | string | null;
  net_profit_vs_raw_usd?: number | string | null;
  psa_grading_fee_usd?: number | string | null;
  psa_note?: string | null;
  roi_vs_raw_net_percent?: number | string | null;
  shipping_and_insurance_usd?: number | string | null;
  turnaround_time?: string | null;
};

type PsaPopulation = {
  psa_population_psa6?: number | string | null;
  psa_population_psa7?: number | string | null;
  psa_population_psa8?: number | string | null;
  psa_population_psa9?: number | string | null;
  psa_population_psa10?: number | string | null;
  psa_population_total?: number | string | null;
  source?: string | null;
};

type Recommendation = {
  reasons?: unknown;
  should_grade?: boolean | null;
  summary?: string | null;
};

type WorthGradingVariant = {
  assumptions?: unknown;
  card?: CardInfo;
  graded_scenarios?: unknown;
  psa_population?: PsaPopulation;
  raw_sale_today?: RawSaleToday;
  recommendation?: Recommendation;
};

type WorthGradingResponse = {
  variants?: unknown;
};

const EMPTY_VALUE = "-";

function parseWorthGradingResponse(response: string) {
  const parsed = parseJsonText(response);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as WorthGradingResponse;
}

function asList(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    );
  }

  return typeof value === "string" && value.trim() ? [value] : [];
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

function CostRow({
  children,
  label,
  tone,
}: {
  children: ReactNode;
  label: string;
  tone?: "negative" | "positive";
}) {
  return (
    <div className="worth-grading-view__cost-row">
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

function ScenarioCard({ scenario }: { scenario: GradedScenario }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const profitTone = getNumberTone(scenario.net_profit_vs_raw_usd);
  const costTone = "negative" as const;

  return (
    <section className="worth-grading-view__scenario default-container-inner">
      <div className="worth-grading-view__scenario-profit">
        <h4>{displayValue(scenario.grade)}</h4>
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
        <span>Grading vs. Selling raw</span>
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
            <h5>Breakdown</h5>
            <div className="worth-grading-view__cost-group">
              <CostRow label="Expected Sale Price">
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
              <CostRow label="eBay Fees" tone={costTone}>
                {formatCost(scenario.ebay_fees_usd)}
              </CostRow>
            </div>
            <div className="worth-grading-view__cost-group">
              <CostRow
                label="Net profit (grading vs. selling raw)"
                tone={profitTone}
              >
                {formatProfit(scenario.net_profit_vs_raw_usd)}
              </CostRow>
            </div>
          </div>

          <div className="worth-grading-view__scenario-meta">
            <div className="worth-grading-view__metric worth-grading-view__tier-metric default-container-inner">
              <span>grading_tier</span>
              <div>
                <strong>{displayValue(scenario.grading_tier)}</strong>
                <small>{formatCurrency(scenario.psa_grading_fee_usd)}</small>
              </div>
            </div>
            <FieldCard label="turnaround">
              {displayValue(scenario.turnaround_time)}
            </FieldCard>
          </div>
          {scenario.psa_note?.trim() && (
            <p className="worth-grading-view__psa-note default-container-inner">
              {scenario.psa_note}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function PsaPopulationCard({ population }: { population?: PsaPopulation }) {
  const gradeCounts = [
    ["PSA 10", population?.psa_population_psa10],
    ["PSA 9", population?.psa_population_psa9],
    ["PSA 8", population?.psa_population_psa8],
    ["PSA 7", population?.psa_population_psa7],
    ["PSA 6", population?.psa_population_psa6],
  ] as const;

  return (
    <article className="worth-grading-view__population-card default-container-inner">
      <div className="worth-grading-view__population-source">
        <span>Source</span>
        <strong>{displayValue(population?.source)}</strong>
      </div>
      <div className="worth-grading-view__population-total">
        <span>Total Population</span>
        <strong>{formatNumber(population?.psa_population_total)}</strong>
      </div>
      <div className="worth-grading-view__population-grades">
        {gradeCounts.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{formatNumber(value)}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function TextList({
  items,
  title,
}: {
  items: string[];
  title: string;
}) {
  if (!items.length) return null;

  return (
    <section className="worth-grading-view__detail-section default-container-inner">
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function WorthGradingView({ grokRequest }: WorthGradingViewProps) {
  const { loading, error, response } = grokRequest;
  const [selectedVariant, setSelectedVariant] = useState({
    index: 0,
    responseKey: "",
  });

  if (loading) return <LoadingState>Researching value...</LoadingState>;
  if (error) return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  if (!response) return null;

  const responseKey = response;
  const data = parseWorthGradingResponse(response);
  if (!data) return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;

  const variants = Array.isArray(data.variants)
    ? data.variants.filter(isVariant)
    : [];
  if (!variants.length) return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;

  const selectedVariantIndex =
    selectedVariant.responseKey === responseKey ? selectedVariant.index : 0;
  const activeVariantIndex = variants[selectedVariantIndex]
    ? selectedVariantIndex
    : 0;
  const activeVariant = variants[activeVariantIndex];
  const assumptions = asList(activeVariant.assumptions);
  const scenarios = Array.isArray(activeVariant.graded_scenarios)
    ? activeVariant.graded_scenarios.filter(isScenario)
    : [];
  const recommendation = activeVariant.recommendation;

  return (
    <section className="worth-grading-view ui-render-fade">
      <article className="worth-grading-view__card default-container">
        <header className="default-container-header worth-grading-view__header">
          <h2 className="feature-section-heading">Grading Recommendation</h2>
        </header>

        <div className="default-container-body worth-grading-view__body">
          <fieldset
            aria-label="Grading recommendation variant"
            className="worth-grading-view__variant-selector feature-variant-radio-group"
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

          <section className="worth-grading-view__json-section">
            <h3 className="worth-grading-view__section-title">Recommendation</h3>
            <div className="worth-grading-view__badges">
              {typeof recommendation?.should_grade === "boolean" && (
                <Badge
                  accent={recommendation.should_grade ? "green" : "red"}
                  weight="strong"
                >
                  {recommendation.should_grade ? "Worth grading" : "Do not grade"}
                </Badge>
              )}
            </div>
            <div className="worth-grading-view__detail-grid">
              <TextList
                items={asList(recommendation?.summary)}
                title="Summary"
              />
              <TextList
                items={asList(recommendation?.reasons)}
                title="Reasons"
              />
            </div>
          </section>

          <TextList
            items={assumptions}
            title="Assumptions"
          />

          <section className="worth-grading-view__json-section">
            <h3 className="worth-grading-view__section-title">Raw Sale Today</h3>
            <div className="worth-grading-view__summary-grid">
              <FieldCard label="gross_sale_usd">
                {formatCurrency(activeVariant.raw_sale_today?.gross_sale_usd)}
              </FieldCard>
              <FieldCard label="estimated_fees_usd">
                {formatCurrency(activeVariant.raw_sale_today?.estimated_fees_usd)}
              </FieldCard>
              <FieldCard label="net_proceeds_usd">
                {formatCurrency(activeVariant.raw_sale_today?.net_proceeds_usd)}
              </FieldCard>
              <FieldCard label="time_to_sell">
                {displayValue(activeVariant.raw_sale_today?.time_to_sell)}
              </FieldCard>
            </div>
          </section>

          {scenarios.length > 0 && (
            <section className="worth-grading-view__json-section">
              <h3 className="worth-grading-view__section-title">
                Graded Scenarios
              </h3>
              <div className="worth-grading-view__scenario-grid">
                {scenarios.map((scenario, index) => (
                  <ScenarioCard
                    key={`${scenario.grade ?? "scenario"}-${index}`}
                    scenario={scenario}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="worth-grading-view__json-section">
            <h3 className="worth-grading-view__section-title">PSA Population</h3>
            <PsaPopulationCard population={activeVariant.psa_population} />
          </section>

          <section className="worth-grading-view__json-section">
            <h3 className="worth-grading-view__section-title">Raw Response</h3>
            <pre className="worth-grading-view__raw-response">
              {JSON.stringify(data, null, 2)}
            </pre>
          </section>
        </div>
      </article>
    </section>
  );
}
