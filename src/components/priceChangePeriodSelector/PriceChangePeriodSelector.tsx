import {
  formatPriceChangePeriodLabel,
  PRICE_CHANGE_PERIODS,
  type PriceChangePeriod,
} from "../../../shared/priceChangePeriod";
import { RadioButtonGroup } from "../radioButtonGroup/RadioButtonGroup";

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
  return (
    <RadioButtonGroup<PriceChangePeriod>
      ariaLabel={ariaLabel}
      className={["price-change-period-selector", className]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      onChange={onChange}
      options={OPTIONS}
      value={value}
    />
  );
}
