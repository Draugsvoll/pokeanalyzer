import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { User } from "firebase/auth";
import Button from "../../components/button/Button";
import { useNotification } from "../../context/notificationContextValue";
import { useModalDialog } from "../../hooks/useModalDialog";
import { deleteAccount } from "../../services/auth";

export function DeleteAccountSection({
  user,
  requiresCancellation,
  disabled,
}: {
  user: User;
  requiresCancellation: boolean;
  disabled: boolean;
}) {
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const close = useCallback(() => {
    if (!pending.current) setOpen(false);
  }, []);
  const dialogRef = useModalDialog<HTMLDivElement>({
    isOpen: open,
    onClose: close,
  });

  async function confirmDeletion() {
    if (pending.current || requiresCancellation || disabled) return;
    pending.current = true;
    setDeleting(true);
    setError("");
    try {
      await deleteAccount(user);
      showNotification("Your account has been deleted.", "success");
      navigate("/", { replace: true });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "We couldn't delete your account. Please try again.",
      );
    } finally {
      pending.current = false;
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="profile__delete-account">
        <Button
          variant="danger"
          disabled={disabled}
          onClick={() => {
            setError("");
            setOpen(true);
          }}
        >
          Delete account
        </Button>
      </div>
      {open &&
        createPortal(
          <div
            className="profile__delete-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) close();
            }}
          >
            <div
              aria-labelledby="delete-account-title"
              aria-describedby="delete-account-description"
              aria-modal="true"
              aria-busy={deleting}
              className="profile__delete-dialog default-container"
              ref={dialogRef}
              role="dialog"
              tabIndex={-1}
            >
              <h2 id="delete-account-title">Delete your account?</h2>
              <p id="delete-account-description">
                {requiresCancellation
                  ? "Cancel your subscription before deleting your account."
                  : "You will permanently lose access to your account. This cannot be undone."}
              </p>
              {error && <p role="alert">{error}</p>}
              <div className="profile__status-actions">
                <Button variant="secondary" disabled={deleting} onClick={close}>
                  {requiresCancellation ? "Close" : "Cancel"}
                </Button>
                {!requiresCancellation && (
                  <Button
                    variant="danger"
                    disabled={deleting || disabled}
                    aria-busy={deleting}
                    onClick={() => void confirmDeletion()}
                  >
                    {deleting && (
                      <span className="app-btn__spinner" aria-hidden="true" />
                    )}
                    {deleting ? "Deleting account..." : "Delete account"}
                  </Button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
