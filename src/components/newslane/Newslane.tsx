import { useState, type CSSProperties } from "react";
import {
  getCustomColor,
  type CustomColors,
} from "../../utils/customStylings";
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
  { color: "purple", id: "general", label: "Latest News" },
  { color: "teal", id: "movers", label: "Biggest Movers" },
] as const satisfies readonly NewsCategoryConfig[];

export function NewsLane() {
  const [activeCategory, setActiveCategory] = useState<NewsCategory>("general");
  const activeCategoryConfig =
    CATEGORIES.find((category) => category.id === activeCategory) ??
    CATEGORIES[0];

  return (
    <section
      className="news-lane"
      aria-label="News"
      style={{
        "--news-accent": getCustomColor(activeCategoryConfig.color),
      } as CSSProperties}
    >
      <header className="news-lane__header">
        <h2 className="news-lane__title">Market news</h2>
        <nav className="news-lane__nav" aria-label="News category">
          {CATEGORIES.map((category) => {
            const isActive = activeCategory === category.id;

            return (
              <button
                key={category.id}
                type="button"
                className={`news-lane__link${isActive ? " news-lane__link--active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setActiveCategory(category.id)}
                style={{
                  "--category-accent": getCustomColor(category.color),
                } as CSSProperties}
              >
                {category.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="news-lane__panel">
        {/* Keep both mounted so switching tabs does not refetch / lose state */}
        <div
          className="news-lane__view"
          hidden={activeCategory !== "general"}
        >
          <GeneralNews />
        </div>
        <div
          className="news-lane__view"
          hidden={activeCategory !== "movers"}
        >
          <BiggestMovers />
        </div>
      </div>
    </section>
  );
}
