import { forwardRef, useRef } from "react";
import { Search, X } from "lucide-react";
import "./FilterInput.scss";

type FilterInputProps = {
  ariaLabel: string;
  className?: string;
  clearLabel: string;
  id?: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
};

export const FilterInput = forwardRef<HTMLInputElement, FilterInputProps>(
  function FilterInput(
    { ariaLabel, className = "", clearLabel, id, onChange, placeholder, value },
    forwardedRef,
  ) {
    const inputRef = useRef<HTMLInputElement>(null);

    function assignInputRef(node: HTMLInputElement | null) {
      inputRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    }

    return (
      <div
        className={`app-filter-input${className ? ` ${className}` : ""}`}
        role="search"
      >
        <Search aria-hidden="true" className="app-filter-input__icon" />
        <input
          aria-label={ariaLabel}
          autoComplete="off"
          className="app-filter-input__field"
          id={id}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          ref={assignInputRef}
          spellCheck={false}
          type="search"
          value={value}
        />
        {value && (
          <button
            aria-label={clearLabel}
            className="app-filter-input__clear"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>
    );
  },
);
