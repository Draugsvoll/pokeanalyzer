import type { HTMLAttributes, ReactNode } from "react";

type BadgeSize = "sm" | "md";
type BadgeWeight = "medium" | "strong";
type BadgeAccent =
  | "neutral"
  | "blue"
  | "green"
  | "yellow"
  | "orange"
  | "red"
  | "pink"
  | "purple"
  | "teal";

type BadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, "children" | "className"> & {
  children: ReactNode;
  accent?: BadgeAccent;
  size?: BadgeSize;
  weight?: BadgeWeight;
};

export function Badge({
  accent = "neutral",
  children,
  size = "md",
  weight = "medium",
  ...props
}: BadgeProps) {
  const classes = [
    "app-badge",
    `app-badge--${size}`,
    `app-badge--accent-${accent}`,
    `app-badge--weight-${weight}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  );
}
