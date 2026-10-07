import type { ButtonHTMLAttributes } from "react";
import { X } from "lucide-react";
import "./CloseButton.scss";

type CloseButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children" | "type"
> & {
  ariaLabel: string;
};

export function CloseButton({
  ariaLabel,
  className,
  title = ariaLabel,
  ...props
}: CloseButtonProps) {
  const classes = ["close-button", className].filter(Boolean).join(" ");

  return (
    <button
      {...props}
      aria-label={ariaLabel}
      className={classes}
      title={title}
      type="button"
    >
      <X aria-hidden="true" />
    </button>
  );
}
