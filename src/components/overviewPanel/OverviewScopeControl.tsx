import { useId } from "react";
import {
  SegmentedRadioGroup,
  type SegmentedRadioOption,
} from "../ui/SegmentedRadioGroup";
import "./OverviewPanel.scss";

export function OverviewScopeControl<T extends string>({
  ariaLabel,
  disabled,
  onChange,
  options,
  value,
  missingPrices = 0,
  itemLabel = "item",
}: {
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: T) => void;
  options: readonly SegmentedRadioOption<T>[];
  value: T;
  missingPrices?: number;
  itemLabel?: string;
}) {
  const name = useId();
  return (
    <div className="app-overview-scope">
      <SegmentedRadioGroup
        ariaLabel={ariaLabel}
        className="app-overview-scope__selector"
        disabled={disabled}
        name={name}
        onChange={onChange}
        options={options}
        size="small"
        value={value}
      />
      {missingPrices > 0 && (
        <span>
          {missingPrices.toLocaleString("en-US")} {itemLabel}
          {missingPrices === 1 ? " has" : "s have"} no price data
        </span>
      )}
    </div>
  );
}
