import React, { useState } from "react";
import Button from "../../../button/Button";
import { askGrok } from "../../../../utils/grok/grokClient";
import { getGeneralNewsPrompt } from "../../../../utils/grok/grokPrompts";
import "./GeneralNews.scss";

type TrendItem = {
  number?: number;
  title?: string;
  label?: string;
  context?: string;
  points?: string[];
};

type GeneralNewsResponse = {
  overview?: string;
  trends?: TrendItem[];
  overall_sentiment?: string;
};

function parseNews(response: string): GeneralNewsResponse | null {
  try {
    const parsed = JSON.parse(
      response.replace(/^```(?:json)?\s*|\s*```$/gi, "")
    ) as GeneralNewsResponse;

    return Array.isArray(parsed.trends) ||
      typeof parsed.overview === "string" ||
      typeof parsed.overall_sentiment === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export const GeneralNews: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState("");

  const generateNews = async () => {
    if (loading) return;

    setLoading(true);
    setError("");
    setResponse("");

    const result = await askGrok(getGeneralNewsPrompt);

    if (result.ok) setResponse(result.text);
    else setError(result.error);

    setLoading(false);
  };

  const newsData = response ? parseNews(response) : null;

  return (
    <section className="general-news">
      <header className="general-news__header">
        <Button disabled={loading} onClick={generateNews}>
          {loading ? "Generating..." : "Generate news"}
        </Button>
      </header>

      {error && <p className="general-news__error">{error}</p>}
      {response && !newsData && <div className="general-news__raw">{response}</div>}

      {newsData && (
        <>
          {newsData.overview && (
            <p className="general-news__overview">{newsData.overview}</p>
          )}

          {!!newsData.trends?.length && (
            <div className="general-news__trends">
              {newsData.trends.map((trend, index) => (
                <article className="general-news__trend" key={trend.number ?? index}>
                  {trend.number !== undefined && (
                    <span className="general-news__trend-number">{trend.number}</span>
                  )}
                  <div className="general-news__trend-content">
                    <div className="general-news__trend-heading">
                      {trend.title && <h2>{trend.title}</h2>}
                      {trend.label && <span>{trend.label}</span>}
                    </div>
                    {trend.context && <p>{trend.context}</p>}
                    {!!trend.points?.length && (
                      <ul>
                        {trend.points.map((point, pointIndex) =>
                          point ? <li key={`${point}-${pointIndex}`}>{point}</li> : null
                        )}
                      </ul>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {newsData.overall_sentiment && (
            <div className="general-news__sentiment">
              <span>Overall sentiment</span>
              <p>{newsData.overall_sentiment}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
};
