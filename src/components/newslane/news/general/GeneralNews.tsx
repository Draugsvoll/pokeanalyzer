import React, { useState } from "react";
import Button from "../../../button/Button";
import { askGrok } from "../../../../utils/grok/grokClient";
import { getGeneralNewsPrompt } from "../../../../utils/grok/grokPrompts";
import "./GeneralNews.scss";

type NewsItem = {
  headline?: string;
  summary?: string;
  action?: string[];
  url?: string;
};

type GeneralNewsResponse = {
  date?: string;
  items?: NewsItem[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function parseNews(response: string): GeneralNewsResponse | null {
  try {
    const cleaned = response.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
    const parsed: unknown = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const root = parsed as Record<string, unknown>;
    const rawItems = Array.isArray(root.items) ? root.items : [];

    const items = rawItems
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        const row = item as Record<string, unknown>;
        return {
          headline: asString(row.headline) || undefined,
          summary: asString(row.summary) || undefined,
          action: asStringList(row.action),
          url: asString(row.url) || undefined,
        } satisfies NewsItem;
      })
      .filter((item): item is NewsItem => {
        if (!item) return false;
        return Boolean(
          item.headline ||
            item.summary ||
            (item.action && item.action.length > 0) ||
            item.url,
        );
      });

    const date = asString(root.date) || undefined;
    if (!date && items.length === 0) return null;

    return { date, items };
  } catch {
    return null;
  }
}

function formatDateLabel(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
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

    const result = await askGrok(getGeneralNewsPrompt, "market_news");

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
      {response && !newsData && (
        <div className="general-news__raw">{response}</div>
      )}

      {newsData && (
        <>
          {newsData.date && (
            <p className="general-news__date">
              Report date · {formatDateLabel(newsData.date)}
            </p>
          )}

          {!!newsData.items?.length && (
            <div className="general-news__trends">
              {newsData.items.map((item, index) => (
                <article
                  className="general-news__trend"
                  key={item.headline ?? item.url ?? index}
                >
                  <div className="general-news__trend-number" aria-hidden="true">
                    {index + 1}
                  </div>
                  <div className="general-news__trend-content">
                    <div className="general-news__trend-heading">
                      {item.headline && <h2>{item.headline}</h2>}
                    </div>

                    {item.summary && <p>{item.summary}</p>}

                    {!!item.action?.length && (
                      <ul>
                        {item.action.map((point, pointIndex) => (
                          <li key={`${point}-${pointIndex}`}>{point}</li>
                        ))}
                      </ul>
                    )}

                    {item.url && (
                      <a
                        className="general-news__link"
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Read source
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
};
