import { forwardRef, type ReactNode } from "react";
import "./OverviewPanel.scss";

type OverviewPanelProps = {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  layout: "three-featured" | "two-featured";
};

type OverviewMetricProps = {
  className?: string;
  detail: ReactNode;
  imageAlt?: string;
  imageSrc?: string;
  label: ReactNode;
  value: ReactNode;
  valueClassName?: string;
};

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export const OverviewPanel = forwardRef<HTMLElement, OverviewPanelProps>(
  function OverviewPanel({ ariaLabel, children, className, layout }, ref) {
    return (
      <section
        aria-label={ariaLabel}
        className={joinClassNames(
          "app-overview-panel",
          `app-overview-panel--${layout}`,
          className,
        )}
        ref={ref}
      >
        {children}
      </section>
    );
  },
);

export function OverviewMetric({
  className,
  detail,
  imageAlt = "",
  imageSrc,
  label,
  value,
  valueClassName,
}: OverviewMetricProps) {
  return (
    <article
      className={joinClassNames(
        "app-overview-metric",
        imageSrc ? "app-overview-metric--featured" : undefined,
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
        <div className="app-overview-metric-detail">{detail}</div>
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
