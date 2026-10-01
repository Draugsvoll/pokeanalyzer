import React from "react";
import type { GeneralNewsPayload } from "../../../../types/news";
import { Badge } from "../../../ui/Badge";
import { getNewsAccentStyle, getNewsLabelAccent } from "../newsStyles";
import "../NewsCards.scss";

type GeneralNewsProps = {
  payload: GeneralNewsPayload;
};

export const GeneralNews: React.FC<GeneralNewsProps> = ({ payload }) => {
  return (
    <section className="general-news news-collection">
      {!!payload.items.length && (
        <div className="news-card-grid">
          {payload.items.map((item, index) => {
            const label = item.label?.trim() ?? "";
            const accent = label ? getNewsLabelAccent(label) : "blue";

            return (
              <article
                className="news-card"
                key={item.headline ?? item.url ?? index}
                style={getNewsAccentStyle(accent)}
              >
                <div className="news-card__content">
                  <div className="news-card__heading">
                    {item.headline && <h2>{item.headline}</h2>}
                    {label && (
                      <Badge accent={accent} size="sm" weight="strong">
                        {label}
                      </Badge>
                    )}
                  </div>

                  {item.summary && (
                    <div className="news-card__body">
                      <p>{item.summary}</p>
                    </div>
                  )}

                  {!!item.action?.length && (
                    <ul className="news-card__list">
                      {item.action.map((point, pointIndex) => (
                        <li key={`${point}-${pointIndex}`}>{point}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
