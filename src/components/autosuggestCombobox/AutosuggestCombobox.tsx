import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import "../selectDropdown/SelectDropdown.scss";
import "./AutosuggestCombobox.scss";

export type AutosuggestOption = {
  label: string;
  value: string;
};

type AutosuggestComboboxProps = {
  ariaLabel: string;
  className?: string;
  inputClassName?: string;
  menuLabel: string;
  onInputChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSelect: (value: string) => void;
  options: readonly AutosuggestOption[];
  placeholder: string;
  value: string;
};

export function AutosuggestCombobox({
  ariaLabel,
  className = "",
  inputClassName,
  menuLabel,
  onInputChange,
  onKeyDown,
  onSelect,
  options,
  placeholder,
  value,
}: AutosuggestComboboxProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const normalizedValue = value.trim().toLocaleLowerCase("en-US");
  const suggestions = options.filter(
    (option) =>
      option.value &&
      (!normalizedValue ||
        option.label.toLocaleLowerCase("en-US").includes(normalizedValue)),
  );
  const menuOpen = open && suggestions.length > 0;

  useEffect(() => {
    if (!open || !rootRef.current) return;

    const ownerDocument = rootRef.current.ownerDocument;
    const closeWhenClickingOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };

    ownerDocument.addEventListener("pointerdown", closeWhenClickingOutside);
    return () =>
      ownerDocument.removeEventListener(
        "pointerdown",
        closeWhenClickingOutside,
      );
  }, [open]);

  function selectSuggestion(index: number) {
    const suggestion = suggestions[index];
    if (!suggestion) return;
    onSelect(suggestion.value);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1,
      );
      return;
    }
    if (event.key === "Escape" && menuOpen) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === "Enter" && menuOpen && activeIndex >= 0) {
      event.preventDefault();
      selectSuggestion(activeIndex);
      return;
    }
    onKeyDown?.(event);
  }

  return (
    <div
      className={`ui-autosuggest${className ? ` ${className}` : ""}${menuOpen ? " is-open" : ""}`}
      ref={rootRef}
    >
      <input
        aria-activedescendant={
          menuOpen && activeIndex >= 0
            ? `${listboxId}-option-${activeIndex}`
            : undefined
        }
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={menuOpen}
        aria-label={ariaLabel}
        autoComplete="off"
        className={inputClassName}
        onChange={(event) => {
          onInputChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        spellCheck={false}
        type="text"
        value={value}
      />
      <ChevronDown aria-hidden="true" className="ui-autosuggest__chevron" />

      {menuOpen && (
        <div
          aria-label={menuLabel}
          className="ui-select-dropdown__menu ui-autosuggest__menu"
          id={listboxId}
          role="listbox"
        >
          {suggestions.map((option, index) => (
            <button
              aria-selected={value === option.value}
              className={`ui-select-dropdown__option${
                index === activeIndex ? " is-active" : ""
              }${value === option.value ? " is-selected" : ""}`}
              id={`${listboxId}-option-${index}`}
              key={option.value}
              onClick={() => selectSuggestion(index)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              tabIndex={-1}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
