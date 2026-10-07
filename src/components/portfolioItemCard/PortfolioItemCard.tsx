import { useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import {
  ConfirmPopover,
  type ConfirmPopoverCancelReason,
} from "../confirmPopover/ConfirmPopover";
import { Badge } from "../ui/Badge";
import "./PortfolioItemCard.scss";

type PortfolioItemCardProps = {
  children: ReactNode;
  className?: string;
  itemName: string;
  onQuantityDialogOpenChange?: (open: boolean) => void;
  quantity: number;
  quantityDialogOpen?: boolean;
  updateQuantity: (quantity: number) => Promise<boolean>;
};

export function PortfolioItemCard({
  children,
  className,
  itemName,
  onQuantityDialogOpenChange,
  quantity,
  quantityDialogOpen,
  updateQuantity,
}: PortfolioItemCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const quantityTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [pendingQuantity, setPendingQuantity] = useState<number | null>(null);
  const [quantityControlsDismissed, setQuantityControlsDismissed] =
    useState(false);
  const [updatingQuantity, setUpdatingQuantity] = useState(false);
  const quantityDialogVisible =
    pendingQuantity != null && quantityDialogOpen !== false;

  function requestQuantityChange(amount: number, trigger: HTMLButtonElement) {
    if (updatingQuantity) return;

    const currentQuantity = quantityDialogVisible ? pendingQuantity : quantity;
    const nextQuantity = currentQuantity + amount;
    if (nextQuantity < 1) return;

    quantityTriggerRef.current = trigger;
    setQuantityControlsDismissed(false);
    setPendingQuantity(nextQuantity);
    onQuantityDialogOpenChange?.(true);
  }

  function cancelQuantityChange(reason: ConfirmPopoverCancelReason) {
    const cancelledWithKeyboard = reason === "keyboard";
    const activeElement = document.activeElement;
    if (
      !cancelledWithKeyboard &&
      activeElement instanceof HTMLElement &&
      cardRef.current?.contains(activeElement)
    ) {
      activeElement.blur();
    }

    setQuantityControlsDismissed(!cancelledWithKeyboard);
    setPendingQuantity(null);
    onQuantityDialogOpenChange?.(false);

    if (cancelledWithKeyboard) {
      requestAnimationFrame(() =>
        quantityTriggerRef.current?.focus({ preventScroll: true }),
      );
    }
  }

  async function confirmQuantityChange() {
    if (!quantityDialogVisible) return;

    setUpdatingQuantity(true);
    try {
      if (!(await updateQuantity(pendingQuantity))) return;
      setPendingQuantity(null);
      onQuantityDialogOpenChange?.(false);
    } finally {
      setUpdatingQuantity(false);
    }
  }

  return (
    <div
      className={[
        "portfolio-item-card",
        className,
        quantityDialogVisible && "portfolio-item-card--confirming",
        quantityControlsDismissed &&
          "portfolio-item-card--quantity-controls-dismissed",
      ]
        .filter(Boolean)
        .join(" ")}
      onPointerEnter={() => setQuantityControlsDismissed(false)}
      ref={cardRef}
    >
      {quantity > 1 && (
        <div className="portfolio-item-card__quantity-anchor">
          <Badge
            aria-label={`${quantity} copies in collection`}
            size="sm"
            weight="strong"
          >
            ×{quantity}
          </Badge>
        </div>
      )}

      {children}

      <div
        className="portfolio-item-card__actions ui-fade"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <button
          aria-label={`Increase ${itemName} quantity`}
          className="portfolio-item-card__quantity-button"
          disabled={updatingQuantity}
          onClick={(event) => requestQuantityChange(1, event.currentTarget)}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <ChevronUp aria-hidden="true" />
        </button>

        <div className="portfolio-item-card__quantity-display">
          <output
            aria-label={`${itemName} quantity`}
            className="portfolio-item-card__quantity"
          >
            {quantityDialogVisible ? pendingQuantity : quantity}
          </output>
          {quantityDialogVisible && (
            <ConfirmPopover
              actionSize="small"
              aria-label="Confirm quantity change"
              cancelAriaLabel="Cancel quantity change"
              cancelLabel={<X aria-hidden="true" />}
              className="portfolio-item-card__quantity-confirm"
              confirmAriaLabel="Apply quantity change"
              confirmDisabled={pendingQuantity === quantity}
              confirming={updatingQuantity}
              confirmLabel={<Check aria-hidden="true" />}
              label={`Quantity: ${pendingQuantity}`}
              onCancel={cancelQuantityChange}
              onConfirm={() => void confirmQuantityChange()}
            />
          )}
        </div>

        <button
          aria-label={`Decrease ${itemName} quantity`}
          className="portfolio-item-card__quantity-button"
          disabled={
            (quantityDialogVisible ? pendingQuantity : quantity) <= 1 ||
            updatingQuantity
          }
          onClick={(event) => requestQuantityChange(-1, event.currentTarget)}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <ChevronDown aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
