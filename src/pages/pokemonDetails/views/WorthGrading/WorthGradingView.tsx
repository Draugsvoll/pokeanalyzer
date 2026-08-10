import { FileText, Scale } from "lucide-react";
import type { ReactNode } from "react";
import { LoadingState } from "../../../../components/loadingState/LoadingState";
import { Badge } from "../../../../components/ui/Badge";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
import { parseJsonText } from "../../../../utils/parseJsonText";
import { FEATURE_ERROR_MESSAGE } from "../featureError";
import "./WorthGradingView.scss";

type WorthGradingViewProps = {
  grokRequest: GrokRequestState;
};

type GradedScenario = {
  break_even?: boolean;
  ebay_fees_usd?: number | string;
  expected_sale_price_usd?: number | string;
  grade?: string;
  grading_cost_usd?: number | string;
  net_after_all_costs_usd?: number | string;
  net_profit_vs_raw_usd?: number | string;
  notes?: string;
  psa_7_population?: number | string;
  psa_7_population_percent?: number | string;
  psa_8_population?: number | string;
  psa_8_population_percent?: number | string;
  psa_9_population?: number | string;
  psa_9_population_percent?: number | string;
  psa_10_population?: number | string;
  psa_10_population_percent?: number | string;
  psa_population?: number | string;
  psa_population_percent?: number | string;
  roi_vs_raw_net_percent?: number | string;
};

type WorthGradingResponse = {
  assumptions?: {
    ebay_fee_rate_high_value?: number | string;
    ebay_fee_rate_low?: number | string;
    grading_fee_usd?: number | string;
    grading_service?: string;
    grading_tier?: string;
    high_value_threshold_usd?: number | string;
    notes?: string;
    raw_market_price_usd?: number | string;
    shipping_insurance_supplies_usd?: number | string;
    total_grading_cost_usd?: number | string;
  };
  card?: {
    name?: string;
    number?: string;
    set?: string;
    variant?: string;
    year?: number | string;
  };
  graded_scenarios?: GradedScenario[];
  methodology?: string;
  probability_context?: {
    psa_total_population?: number | string;
  };
  raw_sale_today?: {
    estimated_fees_usd?: number | string;
    gross_sale_usd?: number | string;
    net_proceeds_usd?: number | string;
    time_to_cash?: string;
  };
  recommendation?: {
    beginner_advice?: string;
    reasons?: unknown;
    should_grade?: boolean;
    summary?: string;
    when_it_can_make_sense?: unknown;
  };
};

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

const EMPTY_NUMERIC_VALUE = "-";

function asNumber(value: unknown) {
  if (value == null) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const isParenthesizedNegative = /^\(.*\)$/.test(trimmed);
  const normalized = trimmed
    .replace(/[−–—]/g, "-")
    .replace(/[()]/g, "")
    .replace(/[$€£¥,%]/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, "");
  const number = Number(normalized);

  if (Number.isFinite(number)) {
    return isParenthesizedNegative ? -Math.abs(number) : number;
  }

  const match = normalized.match(/[+-]?\d+(?:\.\d+)?/);
  if (!match) return null;

  const matchedNumber = Number(match[0]);
  if (!Number.isFinite(matchedNumber)) return null;

  return isParenthesizedNegative ? -Math.abs(matchedNumber) : matchedNumber;
}

function formatCurrency(value: unknown) {
  const number = asNumber(value);
  if (number == null) return EMPTY_NUMERIC_VALUE;

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(number);
}

function formatPercent(value: unknown) {
  const number = asNumber(value);
  if (number == null) return EMPTY_NUMERIC_VALUE;
  return `${number.toFixed(1)}%`;
}

function formatRate(value: unknown) {
  const number = asNumber(value);
  if (number == null) return EMPTY_NUMERIC_VALUE;
  return `${(number * 100).toFixed(1)}%`;
}

function formatNumber(value: unknown) {
  const number = asNumber(value);
  if (number == null) return EMPTY_NUMERIC_VALUE;

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(number);
}

function formatProfit(value: unknown) {
  const number = asNumber(value);
  if (number == null) return EMPTY_NUMERIC_VALUE;

  const sign = number > 0 ? "+" : "";
  return `${sign}${formatCurrency(number)}`;
}

function getSignedTone(value: string | null) {
  if (!value || value === EMPTY_NUMERIC_VALUE) return undefined;
  return value.startsWith("-") ||
    value.startsWith("−") ||
    value.startsWith("–") ||
    value.startsWith("—")
    ? "negative"
    : "positive";
}

function getScenarioPopulation(scenario: GradedScenario) {
  const grade = String(scenario.grade ?? "").match(/\b(?:PSA\s*)?(7|8|9|10)\b/i)?.[1];

  if (!grade) {
    return {
      population: scenario.psa_population,
      percent: scenario.psa_population_percent,
    };
  }

  const populationKey = `psa_${grade}_population` as keyof GradedScenario;
  const percentKey = `psa_${grade}_population_percent` as keyof GradedScenario;

  return {
    population: scenario.psa_population ?? scenario[populationKey],
    percent: scenario.psa_population_percent ?? scenario[percentKey],
  };
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
  if (children == null || children === "") return null;

  return (
    <div className="worth-grading-view__metric feature-card-inner-surface">
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

export function WorthGradingView({ grokRequest }: WorthGradingViewProps) {
  const { loading, error, response } = grokRequest;

  if (loading) return <LoadingState>Researching value...</LoadingState>;
  if (error) return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  if (!response) return null;

  const data = parseWorthGradingResponse(response);
  if (!data) return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;

  const card = data.card;
  const assumptions = data.assumptions;
  const rawSale = data.raw_sale_today;
  const scenarios = Array.isArray(data.graded_scenarios)
    ? data.graded_scenarios
    : [];
  const probabilityContext = data.probability_context;
  const recommendation = data.recommendation;

  return (
    <section className="worth-grading-view ui-render-fade">
      <article className="worth-grading-view__card feature-card-surface">
        <header className="feature-panel-header worth-grading-view__header">
          <h2 className="feature-section-heading">Grading Recommendation</h2>
        </header>

        <div className="feature-panel-body worth-grading-view__body">
          <section className="worth-grading-view__json-section">
            <h3 className="worth-grading-view__section-title">Card</h3>
            <div className="worth-grading-view__summary-grid">
              <FieldCard label="name">{card?.name}</FieldCard>
              <FieldCard label="set">{card?.set}</FieldCard>
              <FieldCard label="number">{card?.number}</FieldCard>
              <FieldCard label="variant">{card?.variant}</FieldCard>
              <FieldCard label="year">{card?.year}</FieldCard>
            </div>
          </section>

          <section className="worth-grading-view__json-section">
            <h3 className="worth-grading-view__section-title">Assumptions</h3>
            <div className="worth-grading-view__summary-grid">
              <FieldCard label="raw_market_price_usd">
                {formatCurrency(assumptions?.raw_market_price_usd)}
              </FieldCard>
              <FieldCard label="grading_service">
                {assumptions?.grading_service}
              </FieldCard>
              <FieldCard label="grading_tier">
                {assumptions?.grading_tier}
              </FieldCard>
              <FieldCard label="grading_fee_usd">
                {formatCurrency(assumptions?.grading_fee_usd)}
              </FieldCard>
              <FieldCard label="shipping_insurance_supplies_usd">
                {formatCurrency(assumptions?.shipping_insurance_supplies_usd)}
              </FieldCard>
              <FieldCard label="total_grading_cost_usd">
                {formatCurrency(assumptions?.total_grading_cost_usd)}
              </FieldCard>
              <FieldCard label="ebay_fee_rate_low">
                {formatRate(assumptions?.ebay_fee_rate_low)}
              </FieldCard>
              <FieldCard label="ebay_fee_rate_high_value">
                {formatRate(assumptions?.ebay_fee_rate_high_value)}
              </FieldCard>
              <FieldCard label="high_value_threshold_usd">
                {formatCurrency(assumptions?.high_value_threshold_usd)}
              </FieldCard>
            </div>
            <TextList
              icon={<FileText aria-hidden="true" size={18} strokeWidth={2.1} />}
              items={asList(assumptions?.notes)}
              title="notes"
            />
          </section>

          <section className="worth-grading-view__json-section">
            <h3 className="worth-grading-view__section-title">Raw Sale Today</h3>
            <div className="worth-grading-view__summary-grid">
              <FieldCard label="gross_sale_usd">
                {formatCurrency(rawSale?.gross_sale_usd)}
              </FieldCard>
              <FieldCard label="estimated_fees_usd">
                {formatCurrency(rawSale?.estimated_fees_usd)}
              </FieldCard>
              <FieldCard label="net_proceeds_usd">
                {formatCurrency(rawSale?.net_proceeds_usd)}
              </FieldCard>
              <FieldCard label="time_to_cash">{rawSale?.time_to_cash}</FieldCard>
            </div>
          </section>

          {scenarios.length > 0 && (
            <section className="worth-grading-view__json-section">
              <h3 className="worth-grading-view__section-title">
                Graded Scenarios
              </h3>
              <div className="worth-grading-view__scenario-grid">
                {scenarios.map((scenario, index) => {
                  const profitText = formatProfit(scenario.net_profit_vs_raw_usd);
                  const roiText = formatPercent(scenario.roi_vs_raw_net_percent);
                  const population = getScenarioPopulation(scenario);

                  return (
                    <section
                      className="worth-grading-view__scenario feature-card-inner-surface"
                      key={`${scenario.grade ?? "scenario"}-${index}`}
                    >
                      <h4>{scenario.grade ?? `scenario_${index}`}</h4>
                      <div className="worth-grading-view__summary-grid">
                        <FieldCard label="grade">{scenario.grade}</FieldCard>
                        <FieldCard label="expected_sale_price_usd">
                          {formatCurrency(scenario.expected_sale_price_usd)}
                        </FieldCard>
                        <FieldCard label="grading_cost_usd">
                          {formatCurrency(scenario.grading_cost_usd)}
                        </FieldCard>
                        <FieldCard label="ebay_fees_usd">
                          {formatCurrency(scenario.ebay_fees_usd)}
                        </FieldCard>
                        <FieldCard label="net_after_all_costs_usd">
                          {formatCurrency(scenario.net_after_all_costs_usd)}
                        </FieldCard>
                        <FieldCard
                          label="roi_vs_raw_net_percent"
                          tone={getSignedTone(roiText)}
                        >
                          {roiText}
                        </FieldCard>
                        <FieldCard
                          label="net_profit_vs_raw_usd"
                          tone={getSignedTone(profitText)}
                        >
                          {profitText}
                        </FieldCard>
                        <FieldCard label="psa_population">
                          {formatNumber(population.population)}
                        </FieldCard>
                        <FieldCard label="psa_population_percent">
                          {formatPercent(population.percent)}
                        </FieldCard>
                        <FieldCard label="break_even">
                          {typeof scenario.break_even === "boolean"
                            ? String(scenario.break_even)
                            : undefined}
                        </FieldCard>
                      </div>
                      <TextList
                        icon={<FileText aria-hidden="true" size={18} strokeWidth={2.1} />}
                        items={asList(scenario.notes)}
                        title="notes"
                      />
                    </section>
                  );
                })}
              </div>
            </section>
          )}

          <section className="worth-grading-view__json-section">
            <h3 className="worth-grading-view__section-title">
              Probability Context
            </h3>
            <div className="worth-grading-view__summary-grid">
              <FieldCard label="psa_total_population">
                {formatNumber(probabilityContext?.psa_total_population)}
              </FieldCard>
            </div>
          </section>

          <section className="worth-grading-view__json-section">
            <h3 className="worth-grading-view__section-title">Recommendation</h3>
            <div className="worth-grading-view__badges">
              {typeof recommendation?.should_grade === "boolean" && (
                <Badge
                  accent={recommendation.should_grade ? "green" : "red"}
                  weight="strong"
                >
                  {String(recommendation.should_grade)}
                </Badge>
              )}
            </div>
            <TextList
              icon={<FileText aria-hidden="true" size={18} strokeWidth={2.1} />}
              items={asList(recommendation?.summary)}
              title="summary"
            />
            <TextList
              icon={<FileText aria-hidden="true" size={18} strokeWidth={2.1} />}
              items={asList(recommendation?.reasons)}
              title="reasons"
            />
            <TextList
              icon={<Scale aria-hidden="true" size={18} strokeWidth={2.1} />}
              items={asList(recommendation?.when_it_can_make_sense)}
              title="when_it_can_make_sense"
            />
            <TextList
              icon={<FileText aria-hidden="true" size={18} strokeWidth={2.1} />}
              items={asList(recommendation?.beginner_advice)}
              title="beginner_advice"
            />
          </section>

          <section className="worth-grading-view__json-section">
            <h3 className="worth-grading-view__section-title">Methodology</h3>
            <TextList
              icon={<FileText aria-hidden="true" size={18} strokeWidth={2.1} />}
              items={asList(data.methodology)}
              title="methodology"
            />
          </section>
        </div>
      </article>
    </section>
  );
}
