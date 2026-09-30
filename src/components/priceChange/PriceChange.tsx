import "./PriceChange.scss";
import {
  formatPriceChangePeriodLabel,
  type PriceChangePeriod,
} from "../../../shared/priceChangePeriod";
import {
  formatAbsolutePriceChangePercent,
  priceChangeDirectionLabel,
  priceChangeTone,
  type PriceChangeTone,
} from "./priceChangeUtils";

type PriceChangeArrowProps = {
  tone: PriceChangeTone;
};

type PriceChangeProps = {
  animate?: boolean;
  ariaLabel?: string;
  className?: string;
  percent: number | null;
  period?: PriceChangePeriod | null;
  title: string;
  unavailableLabel?: string;
};

export function PriceChangeArrow({ tone }: PriceChangeArrowProps) {
  return (
    <span
      aria-hidden="true"
      className={`app-price-change__arrow app-price-change__arrow--${tone}`}
    />
  );
}

export function PriceChangePeriodLabel({
  period,
}: {
  period: PriceChangePeriod;
}) {
  return (
    <span className="app-price-change__period">
      {formatPriceChangePeriodLabel(period)}
    </span>
  );
}

export function PriceChange({
  animate = false,
  ariaLabel,
  className = "",
  percent,
  period,
  title,
  unavailableLabel = "Price change unavailable",
}: PriceChangeProps) {
  if (percent == null) {
    return (
      <span
        aria-label={unavailableLabel}
        className={`app-price-change app-price-change--unavailable${animate ? " ui-render-fade" : ""}${className ? ` ${className}` : ""}`}
        title={unavailableLabel}
      >
        —
      </span>
    );
  }

  const tone = priceChangeTone(percent);
  const formattedPercent = formatAbsolutePriceChangePercent(percent);
  return (
    <span
      aria-label={
        ariaLabel ??
        `${priceChangeDirectionLabel(tone)} by ${formattedPercent}. ${title}`
      }
      className={`app-price-change app-price-change--${tone}${animate ? " ui-render-fade" : ""}${className ? ` ${className}` : ""}`}
      title={title}
    >
      <PriceChangeArrow tone={tone} />
      {formattedPercent}
      {period && <PriceChangePeriodLabel period={period} />}
    </span>
  );
}
