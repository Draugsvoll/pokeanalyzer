import { RotateCcw } from "lucide-react";
import "./ClearFiltersButton.scss";

type ClearFiltersButtonProps = {
  disabled?: boolean;
  label: string;
  onClick: () => void;
};

export function ClearFiltersButton({
  disabled = false,
  label,
  onClick,
}: ClearFiltersButtonProps) {
  return (
    <button
      aria-label={label}
      className="app-clear-filters"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <RotateCcw aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
