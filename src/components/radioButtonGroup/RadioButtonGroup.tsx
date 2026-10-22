import { useId, type ReactNode } from "react";
import "./RadioButtonGroup.scss";

type RadioButtonGroupOption<T extends string> = {
  label: ReactNode;
  value: T;
};

type RadioButtonGroupProps<T extends string> = {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  onChange: (value: T) => void;
  options: readonly RadioButtonGroupOption<T>[];
  value: T;
};

export function RadioButtonGroup<T extends string>({
  ariaLabel,
  className,
  disabled = false,
  onChange,
  options,
  value,
}: RadioButtonGroupProps<T>) {
  const name = useId();

  return (
    <div
      aria-label={ariaLabel}
      className={["radio-button-group", className].filter(Boolean).join(" ")}
      role="radiogroup"
    >
      {options.map((option) => (
        <label className="radio-button-group__option" key={option.value}>
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
