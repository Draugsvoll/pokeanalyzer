import { useId, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import "./InfoTooltip.scss";

type InfoTooltipProps = {
  children: ReactNode;
  className?: string;
  label: string;
};

export function InfoTooltip({ children, className, label }: InfoTooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      className={["info-tooltip", className].filter(Boolean).join(" ")}
      data-open={open}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          event.stopPropagation();
        }
      }}
    >
      <button aria-describedby={id} aria-label={label} type="button">
        <Info aria-hidden="true" />
      </button>
      <span className="info-tooltip__content" id={id} role="tooltip">
        {children}
      </span>
    </span>
  );
}
