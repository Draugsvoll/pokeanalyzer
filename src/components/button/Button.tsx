import React from "react";
import "./Button.scss";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "danger" | "default";
};

export default function Button({
  variant = "default",
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const cls = ["app-btn", `app-btn--${variant}`, className].filter(Boolean).join(" ");

  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}
