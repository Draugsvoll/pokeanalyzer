import type { CSSProperties } from "react";

export type FeatureStyleColor = "purple" | "teal" | "yellow" | "orange" | "pink";

const FEATURE_COLORS: Record<FeatureStyleColor, string> = {
  purple: "#a855f7",
  teal: "#14b8a6",
  yellow: "#eab308",
  orange: "#f59e0b",
  pink: "#f43f5e",
};

export function getFeatureStyles(color: FeatureStyleColor): CSSProperties {
  return {
    "--feature-accent": FEATURE_COLORS[color],
  } as CSSProperties;
}
