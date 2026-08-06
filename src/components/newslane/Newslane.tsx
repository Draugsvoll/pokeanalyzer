import { useEffect, useState, type CSSProperties } from "react";
import { isAbortError } from "../../hooks/useAbortableRequest";
import { fetchNewsFeeds } from "../../services/newsApi";
import type { NewsFeedsResponse } from "../../types/news";
import { getCustomColor, type CustomColors } from "../../utils/customStylings";
import { logClientError } from "../../utils/logClientError";
import { BiggestMovers } from "./news/biggestMovers/BiggestMovers";
import { GeneralNews } from "./news/general/GeneralNews";
import "./Newslane.scss";

type NewsCategory = "general" | "movers";

type NewsCategoryConfig = {
  color: CustomColors;
  id: NewsCategory;
  label: string;
};

const CATEGORIES = [
  { color: "blue", id: "general", label: "General" },
  { color: "teal", id: "movers", label: "TCG Movers" },
] as const satisfies readonly NewsCategoryConfig[];

export function NewsLane() {
  const [activeCategory, setActiveCategory] = useState<NewsCategory>("general");
  const [newsFeeds, setNewsFeeds] = useState<NewsFeedsResponse | null>(null);
  const availableCategories = CATEGORIES.filter((category) =>
    category.id === "general"
      ? Boolean(newsFeeds?.generalNews)
      : Boolean(newsFeeds?.biggestMovers),
  );
  const displayedCategory = availableCategories.some(
    (category) => category.id === activeCategory,
  )
    ? activeCategory
    : availableCategories[0]?.id;
  const activeCategoryConfig =
    CATEGORIES.find((category) => category.id === displayedCategory) ??
    CATEGORIES[0];

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
    <section
      className="news-lane"
      aria-label="News"
      style={
        {
          "--news-accent": getCustomColor(activeCategoryConfig.color),
        } as CSSProperties
      }
    >
      <header className="news-lane__header">
        <h2 className="news-lane__title">Market news</h2>
        <nav className="news-lane__nav" aria-label="News category">
          {availableCategories.map((category) => {
            const isActive = displayedCategory === category.id;

            return (
              <button
                key={category.id}
                type="button"
                className={`news-lane__link${isActive ? " news-lane__link--active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setActiveCategory(category.id)}
                style={
                  {
                    "--category-accent": getCustomColor(category.color),
                  } as CSSProperties
                }
              >
                {category.label}
              </button>
            );
          })}
        </nav>
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
