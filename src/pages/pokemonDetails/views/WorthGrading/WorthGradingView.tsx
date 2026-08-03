import {
  BadgeDollarSign,
  ChartNoAxesCombined,
  CircleDollarSign,
  ReceiptText,
} from "lucide-react";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
import { FEATURE_ERROR_MESSAGE } from "../featureError";
import { LoadingState } from "../../../../components/loadingState/LoadingState";
import "./WorthGradingView.scss";

type WorthGradingViewProps = { grokRequest: GrokRequestState };

type WorthGradingResponse = {
  verdict?: string;
  market_summary?: Record<string, string | number>;
  summary?: string;
  action?: string;
};

function parseResponse(response: string): WorthGradingResponse | null {
  try {
    return JSON.parse(response.replace(/^```(?:json)?\s*|\s*```$/gi, ""));
  } catch {
    return null;
  }
}

function getMarketValue(market: Record<string, string | number>, label: string) {
  const normalizedLabel = label.toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = Object.keys(market).find(
    (item) => item.toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedLabel
  );
  return key ? market[key] : "—";
}

export function WorthGradingView({ grokRequest }: WorthGradingViewProps) {
  const { loading, error, response } = grokRequest;

  if (loading) return <LoadingState>Researching grading value...</LoadingState>;
  if (error) return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  if (!response) return null;

  const data = parseResponse(response);
  if (!data) return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;

  const market = data.market_summary ?? {};
  const marketRows = [
    { label: "Raw ", key: "raw value", Icon: CircleDollarSign, tone: "default" },
    { label: "PSA 8", key: "PSA 8", Icon: ChartNoAxesCombined, tone: "amber" },
    { label: "PSA 9", key: "PSA 9", Icon: ChartNoAxesCombined, tone: "amber" },
    { label: "PSA 10", key: "PSA 10", Icon: BadgeDollarSign, tone: "green" },
    { label: "Grading Cost", key: "grading cost", Icon: ReceiptText, tone: "red" },
  ];

  return (
    <section className="worth-grading-view ui-render-fade">
      <article className="worth-grading-view__card worth-grading-view__panel">
        <h2>{data.verdict ?? "Grading verdict unavailable"}</h2>
        {data.summary && <p>{data.summary}</p>}
      </article>

      <div className="worth-grading-view__card worth-grading-view__market">
        <header className="worth-grading-view__market-header">
          <h3>
            {/* <ChartNoAxesCombined aria-hidden="true" /> */}
            Market prices
          </h3>
          <span>Current values</span>
        </header>
        <div className="worth-grading-view__market-body">
          {marketRows.map(({ label, key, Icon, tone }) => (
            <div
              className={`worth-grading-view__market-row worth-grading-view__market-row--${tone}`}
              key={key}
            >
              <div>
                <Icon aria-hidden="true" />
                <strong>{label}</strong>
              </div>
              <span>{getMarketValue(market, key)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* <article className="worth-grading-view__card worth-grading-view__panel">
        <span className="worth-grading-view__eyebrow worth-grading-view__eyebrow--action">
          <Bolt aria-hidden="true" /> Summary
        </span>
        <p className="worth-grading-view__panel-body">
          {data.action ?? data.verdict}
        </p>
      </article> */}
    </section>
  );
}
