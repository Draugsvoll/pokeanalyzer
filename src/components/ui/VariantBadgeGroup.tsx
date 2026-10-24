import { useId } from "react";
import { Layers3 } from "lucide-react";
import "./VariantBadgeGroup.scss";

type VariantBadgeGroupProps<T extends string | number> = {
  ariaLabel: string;
  className?: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange?: (value: T) => void;
};

export function VariantBadgeGroup<T extends string | number>({
  ariaLabel,
  className,
  options,
  value,
  onChange,
}: VariantBadgeGroupProps<T>) {
  const name = useId();

  return (
    <fieldset
      aria-label={ariaLabel}
      className={["variant-badge-group", className].filter(Boolean).join(" ")}
    >
      <div className="variant-badge-group__options">
        {options.map((option) => (
          <label className="variant-badge-group__option" key={option.value}>
            <input
              checked={value === option.value}
              name={name}
              onChange={onChange ? () => onChange(option.value) : undefined}
              readOnly={!onChange}
              type="radio"
              value={option.value}
            />
            <span>
              <Layers3 aria-hidden="true" />
              <strong>{option.label}</strong>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
