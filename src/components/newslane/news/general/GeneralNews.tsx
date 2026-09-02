import React, { type ComponentProps, type CSSProperties } from "react";
import { ExternalLink } from "lucide-react";
import type { GeneralNewsPayload } from "../../../../types/news";
import { Badge } from "../../../ui/Badge";
import {
  getCustomColor,
  type CustomColors,
} from "../../../../utils/customStylings";
import "./GeneralNews.scss";

type BadgeAccent = NonNullable<ComponentProps<typeof Badge>["accent"]>;
type NewsLabelAccent = Extract<BadgeAccent, CustomColors>;

const LABEL_COLORS: Record<string, NewsLabelAccent> = {
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
] as const satisfies readonly NewsLabelAccent[];

function normalizeLabel(label: string) {
  return label.trim().toLowerCase();
}

function getFallbackLabelColor(label: string): NewsLabelAccent {
  let hash = 0;
  for (const character of label) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return LABEL_COLOR_FALLBACKS[hash % LABEL_COLOR_FALLBACKS.length];
}

function getLabelAccent(label: string): NewsLabelAccent {
  const normalizedLabel = normalizeLabel(label);
  return (
    LABEL_COLORS[normalizedLabel] ?? getFallbackLabelColor(normalizedLabel)
  );
}

function getTrendAccentStyle(accent: NewsLabelAccent): CSSProperties {
  return {
    "--trend-accent": getCustomColor(accent),
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
            const accent = label ? getLabelAccent(label) : "blue";

            return (
              <article
                className="general-news__trend"
                key={item.headline ?? item.url ?? index}
                style={getTrendAccentStyle(accent)}
              >
                <div className="general-news__trend-content">
                  <div className="general-news__trend-heading">
                    {item.headline && <h2>{item.headline}</h2>}
                    {label && (
                      <Badge accent={accent} size="sm" weight="strong">
                        {label}
                      </Badge>
                    )}
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
                      Read more
                      <ExternalLink aria-hidden="true" />
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
