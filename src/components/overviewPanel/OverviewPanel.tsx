import { forwardRef, type ReactNode } from "react";
import "./OverviewPanel.scss";

type OverviewPanelProps = {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
};

type OverviewMetricProps = {
  breakBefore?: boolean;
  className?: string;
  detail?: ReactNode;
  imageAlt?: string;
  imageSrc?: string;
  label: ReactNode;
  primary?: boolean;
  size?: "compact" | "default";
  value: ReactNode;
  valueClassName?: string;
};

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export const OverviewPanel = forwardRef<HTMLElement, OverviewPanelProps>(
  function OverviewPanel({ ariaLabel, children, className }, ref) {
    return (
      <section
        aria-label={ariaLabel}
        className={joinClassNames("app-overview-panel", className)}
        ref={ref}
      >
        <div className="app-overview-panel__layout">{children}</div>
      </section>
    );
  },
);

export function OverviewMetric({
  breakBefore = false,
  className,
  detail,
  imageAlt = "",
  imageSrc,
  label,
  primary = false,
  size = "default",
  value,
  valueClassName,
}: OverviewMetricProps) {
  return (
    <article
      className={joinClassNames(
        "app-overview-metric",
        breakBefore ? "app-overview-metric--break-before" : undefined,
        imageSrc ? "app-overview-metric--featured" : undefined,
        primary ? "app-overview-metric--primary" : undefined,
        size === "compact" ? "app-overview-metric--compact" : undefined,
        className,
      )}
    >
      <div className="app-overview-metric-content">
        <span>{label}</span>
        <strong
          className={joinClassNames("app-overview-value", valueClassName)}
        >
          {value}
        </strong>
        {detail != null && (
          <div className="app-overview-metric-detail">{detail}</div>
        )}
      </div>

      {imageSrc && (
        <img
          alt={imageAlt}
          className="app-overview-metric-image"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
          src={imageSrc}
        />
      )}
    </article>
  );
}
