import type { CSSProperties } from "react";
import { getCustomColor, type CustomColors } from "../../utils/customStylings";
import "./SegmentedRadioGroup.scss";

export type SegmentedRadioOption<T extends string> = {
  color?: CustomColors;
  label: string;
  value: T;
  disabled?: boolean;
  loading?: boolean;
};

type SegmentedRadioGroupProps<T extends string> = {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  name: string;
  onChange: (value: T) => void;
  options: readonly SegmentedRadioOption<T>[];
  size?: "medium" | "small";
  value: T;
};

export function SegmentedRadioGroup<T extends string>({
  ariaLabel,
  className = "",
  disabled = false,
  name,
  onChange,
  options,
  size = "medium",
  value,
}: SegmentedRadioGroupProps<T>) {
  return (
    <div
      className={[
        "segmented-radio-group",
        size === "small" && "segmented-radio-group--small",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const checked = option.value === value;
        const optionDisabled = disabled || option.disabled || option.loading;

        return (
          <label
            key={option.value}
            className={[
              "segmented-radio-group__option",
              optionDisabled && "segmented-radio-group__option--disabled",
            ]
              .filter(Boolean)
              .join(" ")}
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
              disabled={optionDisabled}
              aria-label={option.label}
              aria-busy={option.loading || undefined}
              name={name}
              onChange={() => onChange(option.value)}
              type="radio"
              value={option.value}
            />
            <span>
              <span
                className={
                  option.loading
                    ? "segmented-radio-group__label--loading"
                    : undefined
                }
              >
                {option.label}
              </span>
              {option.loading && (
                <i
                  className="app-loading-spinner segmented-radio-group__spinner"
                  aria-hidden="true"
                />
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
