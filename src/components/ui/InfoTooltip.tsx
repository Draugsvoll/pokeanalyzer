import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Info } from "lucide-react";
import "./InfoTooltip.scss";

type InfoTooltipProps = {
  children: ReactNode;
  className?: string;
  label: string;
  title?: string;
};

function pointerCanHover() {
  return window.matchMedia?.("(hover: hover)").matches ?? false;
}

export function InfoTooltip({
  children,
  className,
  label,
  title,
}: InfoTooltipProps) {
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  function dismiss() {
    setPinned(false);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      dismiss();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <span
      ref={rootRef}
      className={["info-tooltip", className].filter(Boolean).join(" ")}
      data-open={open}
      onMouseEnter={() => {
        if (pointerCanHover()) setOpen(true);
      }}
      onMouseLeave={() => {
        if (pointerCanHover() && !pinned) setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        dismiss();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          dismiss();
          event.stopPropagation();
        }
      }}
    >
      <button
        aria-describedby={id}
        aria-expanded={open}
        aria-label={label}
        type="button"
        onClick={() => {
          if (pinned) {
            dismiss();
            return;
          }
          setPinned(true);
          setOpen(true);
        }}
      >
        <Info aria-hidden="true" />
      </button>
      <span className="info-tooltip__content" id={id} role="tooltip">
        {title ? <strong>{title}</strong> : null}
        {children}
      </span>
    </span>
  );
}
