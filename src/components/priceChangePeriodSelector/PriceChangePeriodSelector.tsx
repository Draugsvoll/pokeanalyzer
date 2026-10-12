import { useId } from "react";
import {
  formatPriceChangePeriodLabel,
  PRICE_CHANGE_PERIODS,
  type PriceChangePeriod,
} from "../../../shared/priceChangePeriod";
import "./PriceChangePeriodSelector.scss";

const OPTIONS = PRICE_CHANGE_PERIODS.map((value) => ({
  label: formatPriceChangePeriodLabel(value).toUpperCase(),
  value,
}));

type PriceChangePeriodSelectorProps = {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  onChange: (period: PriceChangePeriod) => void;
  value: PriceChangePeriod;
};

export function PriceChangePeriodSelector({
  ariaLabel = "Price change period",
  className,
  disabled = false,
  onChange,
  value,
}: PriceChangePeriodSelectorProps) {
  const name = useId();

  return (
    <div
      aria-label={ariaLabel}
      className={["price-change-period-selector", className]
        .filter(Boolean)
        .join(" ")}
      role="radiogroup"
    >
      {OPTIONS.map((option) => (
        <label
          className="price-change-period-selector__option"
          key={option.value}
        >
          <input
            checked={value === option.value}
            disabled={disabled}
            name={name}
            onChange={() => onChange(option.value)}
            type="radio"
            value={option.value}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
