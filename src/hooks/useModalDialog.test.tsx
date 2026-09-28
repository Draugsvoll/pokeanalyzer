import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useModalDialog } from "./useModalDialog";

function ModalHarness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const dialogRef = useModalDialog<HTMLDivElement>({
    isOpen: open,
    onClose: close,
    returnFocusRef: triggerRef,
  });

  return (
    <>
      <button ref={triggerRef} onClick={() => setOpen(true)} type="button">
        Open dialog
      </button>
      {open &&
        createPortal(
          <div ref={dialogRef} role="dialog" tabIndex={-1}>
            <button type="button">First action</button>
            <button type="button">Last action</button>
          </div>,
          document.body,
        )}
    </>
  );
}

describe("useModalDialog", () => {
  test("isolates the dialog, closes on Escape, and restores focus", async () => {
    const { container } = render(<ModalHarness />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    const initialInert = container.inert;

    trigger.focus();
    fireEvent.click(trigger);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "First action" }),
      ).toHaveFocus(),
    );
    expect(container.inert).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(container.inert).toBe(initialInert);
    expect(document.body.style.overflow).toBe("");
    expect(trigger).toHaveFocus();
  });

  test("keeps keyboard focus inside the dialog", async () => {
    render(<ModalHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));

    const first = await screen.findByRole("button", { name: "First action" });
    const last = screen.getByRole("button", { name: "Last action" });
    last.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });
});
