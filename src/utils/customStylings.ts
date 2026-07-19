import type { CSSProperties } from "react";

export type CustomColors = "purple" | "teal" | "yellow" | "orange" | "pink";

const CUSTOM_COLORS: Record<CustomColors, string> = {
  purple: "var(--custom-color-purple)",
  teal: "var(--custom-color-teal)",
  yellow: "var(--custom-color-yellow)",
  orange: "var(--custom-color-orange)",
  pink: "var(--custom-color-pink)",
};

export function getCustomColors(color: CustomColors): CSSProperties {
  return {
    "--feature-accent": CUSTOM_COLORS[color],
  } as CSSProperties;
}
