import type { CSSProperties } from "react";
import { getCustomColor, type CustomColors } from "../../utils/customStylings";
import "./SegmentedRadioGroup.scss";

export type SegmentedRadioOption<T extends string> = {
  color?: CustomColors;
  label: string;
  value: T;
};

type SegmentedRadioGroupProps<T extends string> = {
  ariaLabel: string;
  className?: string;
  name: string;
  onChange: (value: T) => void;
  options: readonly SegmentedRadioOption<T>[];
  value: T;
};

export function SegmentedRadioGroup<T extends string>({
  ariaLabel,
  className = "",
  name,
  onChange,
  options,
  value,
}: SegmentedRadioGroupProps<T>) {
  return (
    <div
      className={["segmented-radio-group", className].filter(Boolean).join(" ")}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const checked = option.value === value;

        return (
          <label
            key={option.value}
            className="segmented-radio-group__option"
            style={
              option.color
                ? ({
                    "--segment-accent": getCustomColor(option.color),
                  } as CSSProperties)
                : undefined
            }
          >
            <input
              checked={checked}
              name={name}
              onChange={() => onChange(option.value)}
              type="radio"
              value={option.value}
            />
            <span>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
