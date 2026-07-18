import { useState } from "react";
import { ChartLine, TrendingDown, TrendingUp } from "lucide-react";
import Button from "../../../button/Button";
import { askGrok } from "../../../../utils/grok/grokClient";
import { getBiggestMovers } from "../../../../utils/grok/grokPrompts";
import "./BiggestMovers.scss";

type Mover = {
  rank?: number;
  card?: string;
  set?: string;
  change?: string;
  notes?: string;
};

type BiggestMoversResponse = {
  report_title?: string;
  period?: string;
  top_gainers?: Mover[];
  top_losers?: Mover[];
  market_context?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseResponse(response: string): BiggestMoversResponse | null {
  try {
    const parsed: unknown = JSON.parse(
      response.replace(/^```(?:json)?\s*|\s*```$/gi, "")
    );

    if (!isRecord(parsed)) return null;
    return parsed as BiggestMoversResponse;
  } catch {
    return null;
  }
}

export function BiggestMovers() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState("");

  const generateBiggestMovers = async () => {
    if (loading) return;

    setLoading(true);
    setError("");
    setResponse("");

    const result = await askGrok(getBiggestMovers, "market_news");

    if (result.ok) setResponse(result.text);
    else setError(result.error);

    setLoading(false);
  };

  const report = response ? parseResponse(response) : null;

  return (
    <section className="biggest-gainers">
      <header className="biggest-gainers__header">
        <div>
          <h1>
            {typeof report?.report_title === "string"
              ? report.report_title
              : "Pokémon TCG Price Movers"}
          </h1>
          <p>Pokémon TCG Singles • Past 30 Days</p>
        </div>
        <div className="biggest-gainers__header-actions">
          {typeof report?.period === "string" && <time>{report.period}</time>}
          <Button disabled={loading} onClick={generateBiggestMovers}>
            {loading ? "Generating..." : "Get biggest movers"}
          </Button>
        </div>
      </header>

      {error && <p className="biggest-gainers__error">{error}</p>}
      {response && !report && <div className="biggest-gainers__raw">{response}</div>}

      {Array.isArray(report?.top_gainers) && report.top_gainers.length > 0 && (
        <div className="biggest-gainers__section">
          <h2 className="biggest-gainers__title--gain"><TrendingUp aria-hidden="true" />Top Gainers</h2>
          <div className="biggest-gainers__list">
            {report.top_gainers.filter(Boolean).map((item, index) => (
              <article className="biggest-gainers__card biggest-gainers__card--gain" key={`${item.rank ?? index}-${item.card ?? "card"}`}>
                <div className="biggest-gainers__rank">#{item.rank ?? index + 1}</div>
                <div className="biggest-gainers__content">
                  <div className="biggest-gainers__card-heading">
                    <div>
                      {item.card && <h3>{item.card}</h3>}
                      {item.set && <p>{item.set}</p>}
                    </div>
                    {item.change && <strong>{item.change}</strong>}
                  </div>
                  {item.notes && <p className="biggest-gainers__notes">{item.notes}</p>}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {Array.isArray(report?.top_losers) && report.top_losers.length > 0 && (
        <div className="biggest-gainers__section">
          <h2 className="biggest-gainers__title--loss"><TrendingDown aria-hidden="true" />Top Losers</h2>
          <div className="biggest-gainers__list">
            {report.top_losers.filter(Boolean).map((item, index) => (
              <article className="biggest-gainers__card biggest-gainers__card--loss" key={`${item.rank ?? index}-${item.card ?? "card"}`}>
                <div className="biggest-gainers__rank">#{item.rank ?? index + 1}</div>
                <div className="biggest-gainers__content">
                  <div className="biggest-gainers__card-heading">
                    <div>
                      {item.card && <h3>{item.card}</h3>}
                      {item.set && <p>{item.set}</p>}
                    </div>
                    {item.change && <strong>{item.change}</strong>}
                  </div>
                  {item.notes && <p className="biggest-gainers__notes">{item.notes}</p>}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {typeof report?.market_context === "string" && (
        <div className="biggest-gainers__context">
          <div><ChartLine aria-hidden="true" /><h2>Market Context</h2></div>
          <p>{report.market_context}</p>
        </div>
      )}
    </section>
  );
}
