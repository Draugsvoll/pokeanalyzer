import { createPortal } from "react-dom";
import type { RefObject } from "react";
import { useModalDialog } from "../../hooks/useModalDialog";
import { CloseButton } from "../closeButton/CloseButton";
import { DatabaseSearch } from "../databaseSearch/DatabaseSearch";
import type { ProductType } from "../productTypeSwitch/ProductTypeSwitch";
import "./EmbeddedCardSearchDialog.scss";

type EmbeddedCardSearchDialogProps = {
  ariaLabel: string;
  initialProductType?: ProductType;
  isOpen: boolean;
  onClose: () => void;
  onPortfolioChanged?: (saved: boolean) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export function EmbeddedCardSearchDialog({
  ariaLabel,
  initialProductType = "singles",
  isOpen,
  onClose,
  onPortfolioChanged,
  returnFocusRef,
}: EmbeddedCardSearchDialogProps) {
  const dialogRef = useModalDialog<HTMLDivElement>({
    isOpen,
    onClose,
    returnFocusRef,
  });

  if (!isOpen) return null;

  return createPortal(
    <div
      aria-label={ariaLabel}
      aria-modal="true"
      className="embedded-card-search ui-render-fade"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.clientX >= event.currentTarget.clientWidth) return;
        onClose();
      }}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <CloseButton
        ariaLabel="Close card search"
        className="embedded-card-search__close"
        onClick={onClose}
      />
      <div className="embedded-card-search__content">
        <DatabaseSearch
          autoFocusName
          embedded
          initialProductType={initialProductType}
          onClose={onClose}
          onPortfolioChanged={onPortfolioChanged}
        />
      </div>
    </div>,
    document.body,
  );
}
