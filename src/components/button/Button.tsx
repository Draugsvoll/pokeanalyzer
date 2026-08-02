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
    | "micro"
    | "portfolio"
    | "primary"
    | "secondary"
    | "warning";
  /**
   * Fill for the default (pill) accent button only.
   * - solid: full accent fill (Search CTA blue by default)
   * - soft: half-transparent wash (mock “Analyze with AI”)
   * - ghost: transparent fill + accent border
   * Override accent with style={getCustomColors("purple"|"blue"|…)}.
   */
  fill?: "solid" | "soft" | "ghost";
  size?: "xsmall" | "small" | "medium" | "large";
  fullWidth?: boolean;
  fitContent?: boolean;
  grow?: boolean;
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = "default",
  fill = "solid",
  size = "medium",
  fullWidth = false,
  fitContent = false,
  grow = false,
  children,
  type = "button",
  onMouseDown,
  ...rest
}, ref) {
  const cls = [
    "app-btn",
    variant === "default" ? "app-btn-pill" : `app-btn--${variant}`,
    variant === "secondary" && "app-btn-pill",
    /* fill modes only apply to default accent pill */
    variant === "default" && `app-btn-pill--${fill}`,
    `app-btn--${size}`,
    fullWidth && "app-btn--full-width",
    fitContent && "app-btn--fit-content",
    grow && "app-btn--grow",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
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
});

export default Button;
