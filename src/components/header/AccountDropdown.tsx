import { useEffect, useId, useRef, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContextValue";

type AccountDropdownProps = {
  initial: string;
  label: string;
};

export function AccountDropdown({ initial, label }: AccountDropdownProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await logout();
      setOpen(false);
      navigate("/");
    } catch {
      setError("Unable to log out. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="header__account"
      ref={rootRef}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (
          event.pointerType === "mouse" &&
          !rootRef.current?.contains(document.activeElement)
        )
          setOpen(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onFocus={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(true);
      }}
    >
      <Link
        aria-label={`${label} profile`}
        aria-expanded={open}
        aria-controls={panelId}
        className="header__avatar-link"
        onClick={() => setOpen(false)}
        ref={triggerRef}
        to="/profile"
      >
        <span className="avatar-initials header__avatar">{initial}</span>
      </Link>
      {open && (
        <div className="header__account-dropdown" id={panelId}>
          <nav className="header__account-panel" aria-label="Account">
            <Link to="/profile" onClick={() => setOpen(false)}>
              <UserRound aria-hidden="true" size={16} />
              My account
            </Link>
            <button
              className="header__logout"
              disabled={pending}
              onClick={() => void handleLogout()}
              type="button"
            >
              <LogOut aria-hidden="true" size={16} />
              {pending ? "Logging out…" : "Log out"}
            </button>
            {error && <p role="alert">{error}</p>}
          </nav>
        </div>
      )}
    </div>
  );
}
