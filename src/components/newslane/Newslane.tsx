import { useEffect, useState } from "react";
import { isAbortError } from "../../hooks/useAbortableRequest";
import {
  cacheNewsFeeds,
  fetchNewsFeeds,
  readCachedNewsFeeds,
} from "../../services/newsApi";
import type { NewsFeedsResponse } from "../../types/news";
import type { CustomColors } from "../../utils/customStylings";
import { logClientError } from "../../utils/logClientError";
import { SegmentedRadioGroup } from "../ui/SegmentedRadioGroup";
import { NEWS_FEATURES } from "../../../shared/newsFeatures";
import { BiggestMovers } from "./news/biggestMovers/BiggestMovers";
import { GeneralNews } from "./news/general/GeneralNews";
import "./Newslane.scss";

type NewsCategory = "general" | "movers";

type NewsCategoryConfig = {
  color: CustomColors;
  label: string;
  value: NewsCategory;
};

const CATEGORIES = [
  { color: "blue", label: "General", value: "general" },
  ...(NEWS_FEATURES.biggestMovers
    ? [{ color: "orange", label: "Movers", value: "movers" } as const]
    : []),
] as const satisfies readonly NewsCategoryConfig[];

function hasVisibleNewsFeeds(feeds: NewsFeedsResponse): boolean {
  return Boolean(
    feeds.generalNews || (NEWS_FEATURES.biggestMovers && feeds.biggestMovers),
  );
}

export function NewsLane() {
  const [activeCategory, setActiveCategory] = useState<NewsCategory>("general");
  const [cachedNews] = useState(() => readCachedNewsFeeds());
  const [newsFeeds, setNewsFeeds] = useState<NewsFeedsResponse | null>(() => {
    return cachedNews && hasVisibleNewsFeeds(cachedNews.feeds)
      ? cachedNews.feeds
      : null;
  });
  const availableCategories = CATEGORIES.filter((category) =>
    category.value === "general"
      ? Boolean(newsFeeds?.generalNews)
      : Boolean(newsFeeds?.biggestMovers),
  );
  const displayedCategory = availableCategories.some(
    (category) => category.value === activeCategory,
  )
    ? activeCategory
    : availableCategories[0]?.value;
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

  if (!displayedCategory) {
    return null;
  }

  return (
    <section className="news-lane" aria-label="News">
      <header className="news-lane__header grid-header">
        <h2 className="news-lane__title">Market News</h2>
        {availableCategories.length > 1 && (
          <SegmentedRadioGroup
            ariaLabel="News category"
            className="news-lane__nav"
            name="news-category"
            onChange={setActiveCategory}
            options={availableCategories}
            value={displayedCategory}
          />
        )}
      </header>

      <div className="news-lane__panel">
        {/* Keep both mounted so switching tabs does not refetch / lose state */}
        {newsFeeds?.generalNews && (
          <div
            className="news-lane__view"
            hidden={displayedCategory !== "general"}
          >
            <GeneralNews payload={newsFeeds.generalNews} />
          </div>
        )}
        {NEWS_FEATURES.biggestMovers && newsFeeds?.biggestMovers && (
          <div
            className="news-lane__view"
            hidden={displayedCategory !== "movers"}
          >
            <BiggestMovers payload={newsFeeds.biggestMovers} />
          </div>
        )}
      </div>
    </section>
  );
}
