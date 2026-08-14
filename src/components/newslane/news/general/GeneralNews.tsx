import React, { type CSSProperties } from "react";
import type { GeneralNewsPayload } from "../../../../types/news";
import {
  getCustomColor,
  type CustomColors,
} from "../../../../utils/customStylings";
import "./GeneralNews.scss";

const LABEL_COLORS: Record<string, CustomColors> = {
  competitive: "teal",
  grading: "teal",
  "high-value sale": "yellow",
  industry: "purple",
  market: "blue",
  "new release": "orange",
  population: "pink",
  promo: "yellow",
  release: "orange",
  restock: "blue",
  "set reveal": "purple",
};

const LABEL_COLOR_FALLBACKS = [
  "blue",
  "teal",
  "yellow",
  "orange",
  "pink",
  "purple",
] as const satisfies readonly CustomColors[];

function normalizeLabel(label: string) {
  return label.trim().toLowerCase();
}

function getFallbackLabelColor(label: string): CustomColors {
  let hash = 0;
  for (const character of label) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return LABEL_COLOR_FALLBACKS[hash % LABEL_COLOR_FALLBACKS.length];
}

function getLabelAccent(label: string): CSSProperties {
  const normalizedLabel = normalizeLabel(label);
  const color =
    LABEL_COLORS[normalizedLabel] ?? getFallbackLabelColor(normalizedLabel);

  return {
    "--label-accent": getCustomColor(color),
  } as CSSProperties;
}

type GeneralNewsProps = {
  payload: GeneralNewsPayload;
};

export const GeneralNews: React.FC<GeneralNewsProps> = ({ payload }) => {
  return (
    <section className="general-news ui-render-fade">
      {!!payload.items.length && (
        <div className="general-news__trends">
          {payload.items.map((item, index) => {
            const label = item.label?.trim() ?? "";

            return (
              <article
                className="general-news__trend surface-hover-lift"
                key={item.headline ?? item.url ?? index}
                style={label ? getLabelAccent(label) : undefined}
              >
                <div className="general-news__trend-content">
                  <div className="general-news__trend-heading">
                    {item.headline && <h2>{item.headline}</h2>}
                    {label && <span>{label}</span>}
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
            );
          })}
        </div>
      )}
    </section>
  );
};
