import type { CSSProperties } from "react";

export type NewsAccent =
  | "neutral"
  | "blue"
  | "green"
  | "yellow"
  | "orange"
  | "red"
  | "pink"
  | "purple"
  | "teal";

const LABEL_COLORS: Record<string, NewsAccent> = {
  competitive: "teal",
  falling: "red",
  grading: "teal",
  high: "green",
  "high-value sale": "yellow",
  industry: "purple",
  low: "red",
  market: "blue",
  medium: "yellow",
  mixed: "purple",
  negative: "red",
  "neutral-negative": "orange",
  neutral: "blue",
  "neutral-positive": "teal",
  "new release": "orange",
  population: "pink",
  positive: "green",
  promo: "yellow",
  release: "orange",
  restock: "blue",
  rising: "green",
  "set reveal": "purple",
  softening: "orange",
  stable: "blue",
};

const FALLBACK_COLORS = [
  "blue",
  "teal",
  "yellow",
  "orange",
  "pink",
  "purple",
] as const satisfies readonly NewsAccent[];

export function getNewsLabelAccent(label: string): NewsAccent {
  const normalizedLabel = label.trim().toLowerCase();
  const knownColor = LABEL_COLORS[normalizedLabel];
  if (knownColor) return knownColor;

  let hash = 0;
  for (const character of normalizedLabel) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

export function getNewsAccentStyle(accent: NewsAccent): CSSProperties {
  return {
    "--news-accent": `var(--custom-color-${accent})`,
  } as CSSProperties;
}
