import { X } from "lucide-react";
import "./ResultGridCloseButton.scss";

type ResultGridCloseButtonProps = {
  ariaLabel: string;
  onClick: () => void;
};

export function ResultGridCloseButton({
  ariaLabel,
  onClick,
}: ResultGridCloseButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      className="result-grid-close"
      onClick={onClick}
      title={ariaLabel}
      type="button"
    >
      <X aria-hidden="true" />
    </button>
  );
}
