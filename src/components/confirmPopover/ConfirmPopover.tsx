import type { ReactNode } from "react";
import Button from "../button/Button";
import "./ConfirmPopover.scss";

export type ConfirmPopoverProps = {
  /** Optional prompt, e.g. "Update?" / "Delete?" */
  label?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirming?: boolean;
  confirmingLabel?: string;
  confirmDisabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

/**
 * Shared confirm strip used across the app (portfolio quantity, price source, etc.).
 * Surface matches `.ui-popover-surface` (same as Source radio panel).
 * Actions use the standard app Button.
 */
export function ConfirmPopover({
  label,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  confirming = false,
  confirmingLabel = "Updating...",
  confirmDisabled = false,
  className,
  "aria-label": ariaLabel,
}: ConfirmPopoverProps) {
  return (
    <div
      className={[
        "ui-popover-surface",
        "ui-confirm-popover",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="dialog"
      aria-label={ariaLabel}
      aria-busy={confirming || undefined}
    >
      {label != null && label !== false && (
        <span className="ui-confirm-popover__label">{label}</span>
      )}
      <Button
        variant="default"
        size="small"
        disabled={confirming || confirmDisabled}
        onClick={onConfirm}
      >
        {confirming ? confirmingLabel : confirmLabel}
      </Button>
      <Button
        variant="default"
        size="small"
        disabled={confirming}
        onClick={onCancel}
      >
        {cancelLabel}
      </Button>
    </div>
  );
}
