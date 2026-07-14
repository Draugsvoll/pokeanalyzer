import type { CSSProperties } from "react";

export type CustomColors = "purple" | "teal" | "yellow" | "orange" | "pink";

const CUSTOM_COLORS: Record<CustomColors, string> = {
  purple: "#a855f7",
  teal: "#14b8a6",
  yellow: "#facc15",
  orange: "#fb923c",
  pink: "#f43f5e",
};

export function getCustomColors(color: CustomColors): CSSProperties {
  return {
    "--feature-accent": CUSTOM_COLORS[color],
  } as CSSProperties;
}
