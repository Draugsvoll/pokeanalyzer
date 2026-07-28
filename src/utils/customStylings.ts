import type { CSSProperties } from "react";

export type CustomColors = "purple" | "teal" | "yellow" | "orange" | "pink" | "blue";

const CUSTOM_COLORS: Record<CustomColors, string> = {
  purple: "var(--custom-color-purple)",
  teal: "var(--custom-color-teal)",
  yellow: "var(--custom-color-yellow)",
  orange: "var(--custom-color-orange)",
  pink: "var(--custom-color-pink)",
  blue: "var(--custom-color-blue)",
};

export function getCustomColor(color: CustomColors): string {
  return CUSTOM_COLORS[color];
}

export function getCustomColors(color: CustomColors): CSSProperties {
  return {
    "--feature-accent": getCustomColor(color),
  } as CSSProperties;
}
