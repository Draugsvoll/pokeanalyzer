import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type UseModalDialogOptions = {
  isOpen: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

function focusableElements(dialog: HTMLElement) {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
}

export function useModalDialog<T extends HTMLElement>({
  isOpen,
  onClose,
  returnFocusRef,
}: UseModalDialogOptions) {
  const dialogRef = useRef<T>(null);

  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;

    const dialog = dialogRef.current;
    const ownerDocument = dialog.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    const returnFocusTarget =
      returnFocusRef?.current ??
      (ownerDocument.activeElement instanceof HTMLElement
        ? ownerDocument.activeElement
        : null);
    const previousBodyOverflow = ownerDocument.body.style.overflow;
    const backgroundElements = Array.from(ownerDocument.body.children)
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && element !== dialog,
      )
      .map((element) => ({ element, wasInert: element.inert }));

    for (const { element } of backgroundElements) element.inert = true;
    ownerDocument.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (event.defaultPrevented) return;
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const elements = focusableElements(dialog);
      if (elements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = elements[0];
      const lastElement = elements[elements.length - 1];
      const activeElement = ownerDocument.activeElement;

      if (
        event.shiftKey &&
        (activeElement === firstElement || !dialog.contains(activeElement))
      ) {
        event.preventDefault();
        lastElement.focus();
      } else if (
        !event.shiftKey &&
        (activeElement === lastElement || !dialog.contains(activeElement))
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    ownerWindow?.addEventListener("keydown", handleKeyDown);
    const focusFrame = ownerWindow?.requestAnimationFrame(() => {
      if (dialog.contains(ownerDocument.activeElement)) return;
      (focusableElements(dialog)[0] ?? dialog).focus({ preventScroll: true });
    });

    return () => {
      if (focusFrame !== undefined) {
        ownerWindow?.cancelAnimationFrame(focusFrame);
      }
      ownerWindow?.removeEventListener("keydown", handleKeyDown);
      ownerDocument.body.style.overflow = previousBodyOverflow;
      for (const { element, wasInert } of backgroundElements) {
        element.inert = wasInert;
      }
      if (returnFocusTarget?.isConnected) {
        returnFocusTarget.focus({ preventScroll: true });
      }
    };
  }, [isOpen, onClose, returnFocusRef]);

  return dialogRef;
}
