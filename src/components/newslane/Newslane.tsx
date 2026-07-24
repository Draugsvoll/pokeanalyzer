import { useState } from "react";
import { BiggestMovers } from "./news/biggestMovers/BiggestMovers";
import { GeneralNews } from "./news/general/GeneralNews";
import "./Newslane.scss";

type NewsCategory = "general" | "movers";

const CATEGORIES: { id: NewsCategory; label: string }[] = [
  { id: "general", label: "Latest News" },
  { id: "movers", label: "Biggest Movers" },
];

export function NewsLane() {
  const [activeCategory, setActiveCategory] = useState<NewsCategory>("general");

  return (
    <section
      className={`news-lane news-lane--${activeCategory}`}
      aria-label="News"
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
