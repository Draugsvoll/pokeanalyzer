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
  size?: "xsmall" | "small" | "medium" | "large";
  fullWidth?: boolean;
  fitContent?: boolean;
  grow?: boolean;
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = "default",
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
    `app-btn--${variant}`,
    `app-btn--${size}`,
    fullWidth && "app-btn--full-width",
    fitContent && "app-btn--fit-content",
    grow && "app-btn--grow",
  ].filter(Boolean).join(" ");

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
