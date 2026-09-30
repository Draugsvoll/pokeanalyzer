import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import Button from "../button/Button";
import { getCustomColors } from "../../utils/customStylings";
import "./ConfirmPopover.scss";

export type ConfirmPopoverProps = {
  /** Optional prompt, e.g. "Update?" / "Delete?" */
  label?: ReactNode;
  actionSize?: "xsmall" | "small";
  confirmLabel?: ReactNode;
  confirmAriaLabel?: string;
  cancelLabel?: ReactNode;
  cancelAriaLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirming?: boolean;
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
  actionSize = "xsmall",
  confirmLabel = "Apply",
  confirmAriaLabel,
  cancelLabel = "Cancel",
  cancelAriaLabel,
  onConfirm,
  onCancel,
  confirming = false,
  confirmDisabled = false,
  className,
  "aria-label": ariaLabel,
}: ConfirmPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    const anchor = popover?.parentElement;
    if (!popover || !anchor) return;

    const updatePlacement = () => {
      popover.classList.remove("ui-confirm-popover--flip-left");

      const popoverRect = popover.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const edgeGap = 8;
      const overflowsRight = popoverRect.right > window.innerWidth - edgeGap;
      const fitsLeft = anchorRect.left - popoverRect.width - edgeGap >= edgeGap;

      popover.classList.toggle(
        "ui-confirm-popover--flip-left",
        overflowsRight && fitsLeft,
      );
    };

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    return () => window.removeEventListener("resize", updatePlacement);
  }, []);

  useEffect(() => {
    if (confirming) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      const clickedPopover =
        target instanceof Node && popoverRef.current?.contains(target);

      if (!clickedPopover) {
        onCancel();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [confirming, onCancel]);

  return (
    <div
      ref={popoverRef}
      className={["ui-popover-surface", "ui-confirm-popover", className]
        .filter(Boolean)
        .join(" ")}
      role="dialog"
      aria-label={ariaLabel}
      aria-busy={confirming || undefined}
    >
      {label != null && label !== false && (
        <span className="ui-confirm-popover__label">{label}</span>
      )}
      <div className="ui-confirm-popover__actions">
        <Button
          variant="default"
          fill="ghost"
          size={actionSize}
          disabled={confirming}
          style={getCustomColors("blue")}
          aria-label={cancelAriaLabel}
          onClick={onCancel}
        >
          {cancelLabel}
        </Button>
        <Button
          variant="default"
          size={actionSize}
          disabled={confirming || confirmDisabled}
          aria-label={
            confirming
              ? `${confirmAriaLabel ?? "Confirm"} in progress`
              : confirmAriaLabel
          }
          onClick={onConfirm}
        >
          {confirming ? (
            <span className="app-btn__spinner" aria-hidden="true" />
          ) : (
            confirmLabel
          )}
        </Button>
      </div>
    </div>
  );
}
