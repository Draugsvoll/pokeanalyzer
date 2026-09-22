import { useEffect, useState } from "react";
import { isAbortError } from "../../hooks/useAbortableRequest";
import {
  cacheNewsFeeds,
  fetchNewsFeeds,
  readCachedNewsFeeds,
} from "../../services/newsApi";
import type { NewsFeedsResponse } from "../../types/news";
import { logClientError } from "../../utils/logClientError";
import { GeneralNews } from "./news/general/GeneralNews";
import "./Newslane.scss";

function hasVisibleNewsFeeds(feeds: NewsFeedsResponse): boolean {
  return Boolean(feeds.generalNews);
}

export function NewsLane() {
  const [cachedNews] = useState(() => readCachedNewsFeeds());
  const [newsFeeds, setNewsFeeds] = useState<NewsFeedsResponse | null>(() => {
    return cachedNews && hasVisibleNewsFeeds(cachedNews.feeds)
      ? cachedNews.feeds
      : null;
  });
  useEffect(() => {
    const controller = new AbortController();

    if (cachedNews?.isFresh && hasVisibleNewsFeeds(cachedNews.feeds)) {
      return () => controller.abort();
    }

    async function refreshNews() {
      let lastError: unknown;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const feeds = await fetchNewsFeeds(controller.signal);
          if (controller.signal.aborted) return;

          if (hasVisibleNewsFeeds(feeds)) {
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

  if (!newsFeeds?.generalNews) {
    return null;
  }

  return (
    <section className="news-lane" aria-label="News">
      <header className="news-lane__header grid-header">
        <h3 className="news-lane__title">Market News</h3>
      </header>

      <div className="news-lane__panel">
        <GeneralNews payload={newsFeeds.generalNews} />
      </div>
    </section>
  );
}
