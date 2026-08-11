import { CheckCircle2, FileText, Info, Scale, XCircle } from "lucide-react";
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

type CardInfo = {
  name?: string | null;
  number?: string | null;
  set?: string | null;
  variant?: string | null;
  year?: number | string | null;
};

type RawSaleToday = {
  estimated_fees_usd?: number | string | null;
  gross_sale_usd?: number | string | null;
  net_proceeds_usd?: number | string | null;
  time_to_sell?: string | null;
};

type GradedScenario = {
  break_even?: boolean | null;
  ebay_fees_usd?: number | string | null;
  expected_sale_price_usd?: number | string | null;
  grade?: string | null;
  grading_cost_usd?: number | string | null;
  grading_tier?: string | null;
  net_after_all_costs_usd?: number | string | null;
  net_profit_vs_raw_usd?: number | string | null;
  notes?: string | null;
  psa_grading_fee_usd?: number | string | null;
  roi_vs_raw_net_percent?: number | string | null;
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
  beginner_advice?: string | null;
  reasons?: unknown;
  should_grade?: boolean | null;
  summary?: string | null;
};

type WorthGradingResponse = {
  assumptions?: unknown;
  card?: CardInfo;
  graded_scenarios?: unknown;
  methodology?: string | null;
  psa_population?: PsaPopulation;
  raw_sale_today?: RawSaleToday;
  recommendation?: Recommendation;
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

function getNumberTone(value: unknown) {
  if (hasParenthesizedNumber(value)) return undefined;

  const number = asNumber(value);
  if (number == null || number === 0) return undefined;
  return number < 0 ? "negative" : "positive";
}

function isScenario(value: unknown): value is GradedScenario {
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
          <li key={`${item}-${index}`}>{item}</li>
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

  const assumptions = asList(data.assumptions);
  const scenarios = Array.isArray(data.graded_scenarios)
    ? data.graded_scenarios.filter(isScenario)
    : [];
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
              <FieldCard label="name">{displayValue(data.card?.name)}</FieldCard>
              <FieldCard label="set">{displayValue(data.card?.set)}</FieldCard>
              <FieldCard label="number">{displayValue(data.card?.number)}</FieldCard>
              <FieldCard label="variant">{displayValue(data.card?.variant)}</FieldCard>
              <FieldCard label="year">{displayValue(data.card?.year)}</FieldCard>
            </div>
          </section>

          <TextList
            icon={<FileText aria-hidden="true" size={18} strokeWidth={2.1} />}
            items={assumptions}
            title="Assumptions"
          />

          <section className="worth-grading-view__json-section">
            <h3 className="worth-grading-view__section-title">Raw Sale Today</h3>
            <div className="worth-grading-view__summary-grid">
              <FieldCard label="gross_sale_usd">
                {formatCurrency(data.raw_sale_today?.gross_sale_usd)}
              </FieldCard>
              <FieldCard label="estimated_fees_usd">
                {formatCurrency(data.raw_sale_today?.estimated_fees_usd)}
              </FieldCard>
              <FieldCard label="net_proceeds_usd">
                {formatCurrency(data.raw_sale_today?.net_proceeds_usd)}
              </FieldCard>
              <FieldCard label="time_to_sell">
                {displayValue(data.raw_sale_today?.time_to_sell)}
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
                  <section
                    className="worth-grading-view__scenario feature-card-inner-surface"
                    key={`${scenario.grade ?? "scenario"}-${index}`}
                  >
                    <h4>{displayValue(scenario.grade)}</h4>
                    <div className="worth-grading-view__summary-grid">
                      <FieldCard label="expected_sale_price_usd">
                        {formatCurrency(scenario.expected_sale_price_usd)}
                      </FieldCard>
                      <FieldCard label="grading_tier">
                        {displayValue(scenario.grading_tier)}
                      </FieldCard>
                      <FieldCard label="psa_grading_fee_usd">
                        {formatCurrency(scenario.psa_grading_fee_usd)}
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
                        tone={getNumberTone(scenario.roi_vs_raw_net_percent)}
                      >
                        {formatPercent(scenario.roi_vs_raw_net_percent)}
                      </FieldCard>
                      <FieldCard
                        label="net_profit_vs_raw_usd"
                        tone={getNumberTone(scenario.net_profit_vs_raw_usd)}
                      >
                        {formatProfit(scenario.net_profit_vs_raw_usd)}
                      </FieldCard>
                      <FieldCard label="break_even">
                        {displayValue(scenario.break_even)}
                      </FieldCard>
                      <FieldCard label="turnaround_time">
                        {displayValue(scenario.turnaround_time)}
                      </FieldCard>
                    </div>
                    <TextList
                      icon={<Info aria-hidden="true" size={18} strokeWidth={2.1} />}
                      items={asList(scenario.notes)}
                      title="Notes"
                    />
                  </section>
                ))}
              </div>
            </section>
          )}

          <section className="worth-grading-view__json-section">
            <h3 className="worth-grading-view__section-title">PSA Population</h3>
            <div className="worth-grading-view__summary-grid">
              <FieldCard label="source">
                {displayValue(data.psa_population?.source)}
              </FieldCard>
              <FieldCard label="psa_population_total">
                {formatNumber(data.psa_population?.psa_population_total)}
              </FieldCard>
              <FieldCard label="psa_population_psa10">
                {formatNumber(data.psa_population?.psa_population_psa10)}
              </FieldCard>
              <FieldCard label="psa_population_psa9">
                {formatNumber(data.psa_population?.psa_population_psa9)}
              </FieldCard>
              <FieldCard label="psa_population_psa8">
                {formatNumber(data.psa_population?.psa_population_psa8)}
              </FieldCard>
              <FieldCard label="psa_population_psa7">
                {formatNumber(data.psa_population?.psa_population_psa7)}
              </FieldCard>
              <FieldCard label="psa_population_psa6">
                {formatNumber(data.psa_population?.psa_population_psa6)}
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
                  {recommendation.should_grade ? "Worth grading" : "Do not grade"}
                </Badge>
              )}
            </div>
            <TextList
              icon={
                recommendation?.should_grade ? (
                  <CheckCircle2 aria-hidden="true" size={18} strokeWidth={2.1} />
                ) : (
                  <XCircle aria-hidden="true" size={18} strokeWidth={2.1} />
                )
              }
              items={asList(recommendation?.summary)}
              title="Summary"
            />
            <TextList
              icon={<Scale aria-hidden="true" size={18} strokeWidth={2.1} />}
              items={asList(recommendation?.reasons)}
              title="Reasons"
            />
            <TextList
              icon={<FileText aria-hidden="true" size={18} strokeWidth={2.1} />}
              items={asList(recommendation?.beginner_advice)}
              title="Beginner Advice"
            />
          </section>

          <TextList
            icon={<FileText aria-hidden="true" size={18} strokeWidth={2.1} />}
            items={asList(data.methodology)}
            title="Methodology"
          />
        </div>
      </article>
    </section>
  );
}
