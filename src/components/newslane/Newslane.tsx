import { useEffect, useState } from "react";
import { isAbortError } from "../../hooks/useAbortableRequest";
import { fetchNewsFeeds } from "../../services/newsApi";
import type { NewsFeedsResponse } from "../../types/news";
import type { CustomColors } from "../../utils/customStylings";
import { logClientError } from "../../utils/logClientError";
import { SegmentedRadioGroup } from "../ui/SegmentedRadioGroup";
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
  { color: "teal", label: "TCG Spikers", value: "movers" },
] as const satisfies readonly NewsCategoryConfig[];

export function NewsLane() {
  const [activeCategory, setActiveCategory] = useState<NewsCategory>("general");
  const [newsFeeds, setNewsFeeds] = useState<NewsFeedsResponse | null>(null);
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

    void fetchNewsFeeds(controller.signal)
      .then((feeds) => {
        if (!controller.signal.aborted) {
          setNewsFeeds(feeds);
        }
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          logClientError("Failed to load SQL news feeds", error);
        }
      });

    return () => controller.abort();
  }, []);

  if (!displayedCategory) {
    return null;
  }

  return (
    <section className="news-lane" aria-label="News">
      <header className="news-lane__header">
        <h2 className="news-lane__title">Market news</h2>
        <SegmentedRadioGroup
          ariaLabel="News category"
          className="news-lane__nav"
          name="news-category"
          onChange={setActiveCategory}
          options={availableCategories}
          value={displayedCategory}
        />
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
        {newsFeeds?.biggestMovers && (
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
