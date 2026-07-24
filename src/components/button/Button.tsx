import React from "react";
import "./Button.scss";

type ButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> & {
  variant?:
    | "auth"
    | "danger"
    | "default"
    | "google"
    | "hero"
    | "portfolio"
    | "primary"
    | "secondary"
    | "warning";
  size?: "small" | "medium" | "large";
  fullWidth?: boolean;
  fitContent?: boolean;
  grow?: boolean;
};

export default function Button({
  variant = "default",
  size = "medium",
  fullWidth = false,
  fitContent = false,
  grow = false,
  children,
  type = "button",
  onMouseDown,
  ...rest
}: ButtonProps) {
  const cls = [
    "app-btn",
    `app-btn--${variant}`,
    `app-btn--${size}`,
    fullWidth && "app-btn--full-width",
    fitContent && "app-btn--fit-content",
    grow && "app-btn--grow",
  ].filter(Boolean).join(" ");

  return (
    <button
      type={type}
      className={cls}
      onMouseDown={(e) => {
        e.preventDefault();
        onMouseDown?.(e);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
