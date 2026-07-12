import type { CSSProperties } from "react";

export type CustomColors = "purple" | "teal" | "yellow" | "orange" | "pink";

const CUSTOM_COLORS: Record<CustomColors, string> = {
  purple: "#a855f7",
  teal: "#14b8a6",
  yellow: "#eab308",
  orange: "#f59e0b",
  pink: "#f43f5e",
};

export function getCustomColors(color: CustomColors): CSSProperties {
  return {
    "--color-accent": CUSTOM_COLORS[color],
  } as CSSProperties;
}
