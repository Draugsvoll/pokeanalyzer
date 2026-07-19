import { BadgeDollarSign, Bolt, ChartNoAxesCombined, CircleDollarSign, Gavel, Info, ReceiptText } from "lucide-react";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
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

  if (loading) return <p className="worth-grading-view__state">Researching grading value...</p>;
  if (error) return <p className="card-view__page-error">{error}</p>;
  if (!response) return null;

  const data = parseResponse(response);
  if (!data) return <p className="worth-grading-view__raw">{response}</p>;

  const market = data.market_summary ?? {};
  const marketRows = [
    { label: "Raw (NM)", key: "raw value", Icon: CircleDollarSign, tone: "default" },
    { label: "PSA 8", key: "PSA 8", Icon: ChartNoAxesCombined, tone: "amber" },
    { label: "PSA 9", key: "PSA 9", Icon: ChartNoAxesCombined, tone: "amber" },
    { label: "PSA 10", key: "PSA 10", Icon: BadgeDollarSign, tone: "green" },
    { label: "Grading Cost", key: "grading cost", Icon: ReceiptText, tone: "red" },
  ];

  return (
    <section className="worth-grading-view ui-render-fade">
      <div className="worth-grading-view__verdict">
        <div className="worth-grading-view__eyebrow"><Gavel aria-hidden="true" /> Final verdict</div>
        <h2>{data.verdict ?? "Grading verdict unavailable"}</h2>
        <p>{data.summary}</p>
      </div>

      <div className="worth-grading-view__summary">
        <div className="worth-grading-view__section-heading">
          <h3>Quick Summary</h3><span>Current market</span>
        </div>
        <div className="worth-grading-view__market">
          {marketRows.map(({ label, key, Icon, tone }) => (
            <div className={`worth-grading-view__market-row worth-grading-view__market-row--${tone}`} key={key}>
              <div><Icon aria-hidden="true" /><strong>{label}</strong></div>
              <span>{getMarketValue(market, key)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="worth-grading-view__bottom-line">
        <Info aria-hidden="true" />
        <div><h3>Bottom Line</h3><p>{data.summary}</p></div>
      </div>

      <div className="worth-grading-view__action">
        <Bolt aria-hidden="true" />
        <div><strong>TL;DR</strong><p>{data.action ?? data.verdict}</p></div>
      </div>
    </section>
  );
}
