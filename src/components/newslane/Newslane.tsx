import { useEffect, useState } from "react";
import { isAbortError } from "../../hooks/useAbortableRequest";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import {
  cacheNewsFeeds,
  fetchNewsFeeds,
  readCachedNewsFeeds,
} from "../../services/newsApi";
import {
  cacheMarketSummary,
  fetchMarketSummary,
  readCachedMarketSummary,
} from "../../services/marketSummaryApi";
import type { MarketSummaryPayload, NewsFeedsResponse } from "../../types/news";
import { logClientError } from "../../utils/logClientError";
import { GeneralNews } from "./news/general/GeneralNews";
import { MarketSummary } from "./news/summary/MarketSummary";
import "./Newslane.scss";

function formatUpdatedAt(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(timestamp);
}

export function NewsLane() {
  const marketSummaryRevealRef = useScrollReveal<HTMLElement>();
  const [cachedNews] = useState(() => readCachedNewsFeeds());
  const [newsFeeds, setNewsFeeds] = useState<NewsFeedsResponse | null>(() => {
    return cachedNews?.feeds ?? null;
  });
  const [cachedSummary] = useState(() => readCachedMarketSummary());
  const [marketSummary, setMarketSummary] =
    useState<MarketSummaryPayload | null>(
      () => cachedSummary?.marketSummary ?? null,
    );

  useEffect(() => {
    const controller = new AbortController();

    if (cachedNews?.isFresh) {
      return () => controller.abort();
    }

    async function refreshNews() {
      let lastError: unknown;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const feeds = await fetchNewsFeeds(controller.signal);
          if (controller.signal.aborted) return;

          if (feeds.generalNews) {
            cacheNewsFeeds(feeds);
            setNewsFeeds(feeds);
            return;
          }

          lastError = new Error("News response did not contain any feeds");
        } catch (error: unknown) {
          if (isAbortError(error)) return;
          lastError = error;
        }
      }

      logClientError("Failed to refresh SQL news feeds", lastError);
    }

    void refreshNews();

    return () => controller.abort();
  }, [cachedNews]);

  useEffect(() => {
    const controller = new AbortController();

    if (cachedSummary?.isFresh) {
      return () => controller.abort();
    }

    async function refreshMarketSummary() {
      let lastError: unknown;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const summary = await fetchMarketSummary(controller.signal);
          if (controller.signal.aborted) return;

          if (summary) {
            cacheMarketSummary(summary);
            setMarketSummary(summary);
            return;
          }

          lastError = new Error(
            "Market summary response did not contain a summary",
          );
        } catch (error: unknown) {
          if (isAbortError(error)) return;
          lastError = error;
        }
      }

      logClientError("Failed to refresh market summary", lastError);
    }

    void refreshMarketSummary();

    return () => controller.abort();
  }, [cachedSummary]);

  if (!newsFeeds?.generalNews && !marketSummary) {
    return null;
  }

  const summaryUpdatedAt = marketSummary
    ? formatUpdatedAt(marketSummary.generatedAt)
    : "";

  return (
    <div className="news-lane" aria-label="News">
      {newsFeeds?.generalNews && (
        <section
          aria-label="Weekly News"
          className="news-lane__section ui-render-fade"
        >
          <header className="news-lane__header grid-header">
            <h3 className="news-lane__title">Weekly News</h3>
          </header>

          <div className="news-lane__panel">
            <GeneralNews payload={newsFeeds.generalNews} />
          </div>
        </section>
      )}

      {marketSummary && (
        <section
          aria-label="Weekly Market Report"
          className="news-lane__section ui-scroll-reveal ui-render-fade"
          ref={marketSummaryRevealRef}
        >
          <header className="news-lane__header grid-header">
            <h3 className="news-lane__title">Weekly Market Report</h3>
            {summaryUpdatedAt && (
              <span className="news-lane__updated">
                Updated {summaryUpdatedAt}
              </span>
            )}
          </header>

          <div className="news-lane__panel">
            <MarketSummary payload={marketSummary} />
          </div>
        </section>
      )}
    </div>
  );
}
