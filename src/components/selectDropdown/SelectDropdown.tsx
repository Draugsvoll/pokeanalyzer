import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import "./SelectDropdown.scss";

export type SelectDropdownOption<T extends string> = {
  value: T;
  label: string;
};

type SelectDropdownProps<T extends string> = {
  ariaLabel: string;
  className?: string;
  compact?: boolean;
  onChange: (value: T) => void;
  options: SelectDropdownOption<T>[];
  value: T;
};

export function SelectDropdown<T extends string>({
  ariaLabel,
  className = "",
  compact = false,
  onChange,
  options,
  value,
}: SelectDropdownProps<T>) {
  const menuId = useId();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedLabel =
    options.find((option) => option.value === value)?.label ??
    options[0]?.label ??
    "";

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
        <span>{selectedLabel}</span>
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
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
