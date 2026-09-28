import { useState } from "react";
import { createPortal } from "react-dom";
import "./Loginmodal.scss";
import Button from "../button/Button";
import { login, signInWithGoogle } from "../../services/auth";
import { GoogleLoginButton } from "../googleLoginButton/GoogleLoginButton";
import { useNotification } from "../../context/notificationContextValue";
import { useModalDialog } from "../../hooks/useModalDialog";
import { Link } from "react-router-dom";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginModal({ isOpen, onClose }: ModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const dialogRef = useModalDialog<HTMLDivElement>({ isOpen, onClose });

  const { showNotification } = useNotification();

  if (!isOpen) return null;

  const finishLogin = () => {
    onClose();
    showNotification("You are now logged in.");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your email address.");
      return;
    }
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }

    setLoading(true);
    try {
      await login(trimmedEmail, password);
      finishLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (loading) return;

    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      finishLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google login failed.");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="login-overlay"
      onMouseDown={onClose}
      ref={dialogRef}
      tabIndex={-1}
    >
      <section
        className="login-modal auth-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="auth-card__header">
          <span className="auth-card__eyebrow">Welcome back</span>
          <h2 id="login-modal-title">Log in</h2>
          <p>Access your collection and account.</p>
        </header>

        <div className="auth-card__google">
          <GoogleLoginButton
            disabled={loading}
            onClick={() => void handleGoogleLogin()}
          />
        </div>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <form className="auth-form" onSubmit={handleLogin} noValidate>
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <Button
            type="submit"
            variant="auth"
            size="large"
            fullWidth
            disabled={loading}
          >
            {loading ? "Logging in..." : "Log in"}
          </Button>
        </form>

        {error && (
          <p className="auth-notice auth-notice--error" role="alert">
            {error}
          </p>
        )}

        <div className="login-modal__close">
          <Button fill="ghost" size="large" fullWidth onClick={onClose}>
            Close
          </Button>
        </div>
        <p className="login-modal__signup">
          New here?{" "}
          <Link to="/signup" onClick={onClose}>
            Create an account
          </Link>
        </p>
      </section>
    </div>,
    document.body,
  );
}
