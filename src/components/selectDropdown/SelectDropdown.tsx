import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import "./SelectDropdown.scss";

export type SelectDropdownOption<T extends string> = {
  value: T;
  label: string;
  secondaryLabel?: string;
};

type SelectDropdownProps<T extends string> = {
  ariaLabel: string;
  className?: string;
  compact?: boolean;
  leadingIcon?: ReactNode;
  onChange: (value: T) => void;
  options: SelectDropdownOption<T>[];
  value: T;
};

export function SelectDropdown<T extends string>({
  ariaLabel,
  className = "",
  compact = false,
  leadingIcon,
  onChange,
  options,
  value,
}: SelectDropdownProps<T>) {
  const menuId = useId();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedOption =
    options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;

    const closeWhenClickingOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !dropdownRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeWhenClickingOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenClickingOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div
      className={[
        "ui-select-dropdown",
        compact ? "ui-select-dropdown--compact" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      ref={dropdownRef}
    >
      <button
        type="button"
        className={`ui-select-dropdown__toggle${open ? " is-open" : ""}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="ui-select-dropdown__value">
          {leadingIcon && (
            <span
              className="ui-select-dropdown__leading-icon"
              aria-hidden="true"
            >
              {leadingIcon}
            </span>
          )}
          <span>{selectedOption?.label ?? ""}</span>
          {selectedOption?.secondaryLabel && (
            <span className="ui-select-dropdown__secondary">
              <i aria-hidden="true">-</i>
              {selectedOption.secondaryLabel}
            </span>
          )}
        </span>
        <ChevronDown
          className="ui-select-dropdown__chevron"
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={menuId}
          className="ui-select-dropdown__menu ui-render-fade"
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={value === option.value}
              className={`ui-select-dropdown__option${
                value === option.value ? " is-selected" : ""
              }`}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.secondaryLabel && (
                <span className="ui-select-dropdown__secondary">
                  <i aria-hidden="true">-</i>
                  {option.secondaryLabel}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
