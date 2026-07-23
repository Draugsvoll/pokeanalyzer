import React from "react";
import generalNews from "../../../../data/news/generalNews.json";
import "./GeneralNews.scss";

type NewsItem = {
  headline?: string;
  summary?: string;
  action?: string[];
  url?: string;
};

type GeneralNewsResponse = {
  items?: NewsItem[];
};

export const GeneralNews: React.FC = () => {
  const newsData = generalNews as GeneralNewsResponse;

  return (
    <section className="general-news ui-render-fade">
      <header className="general-news__header">
        <h1 className="general-news__title">Latest News</h1>
      </header>

      {!!newsData?.items?.length && (
        <div className="general-news__trends">
          {newsData.items.map((item, index) => (
            <article
              className="general-news__trend"
              key={item.headline ?? item.url ?? index}
            >
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
    </section>
  );
};
