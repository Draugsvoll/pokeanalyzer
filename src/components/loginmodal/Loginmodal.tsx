import { useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import "./Loginmodal.scss";
import Button from "../button/Button";
import { login, signInWithGoogle } from "../../services/auth";
import { GoogleLoginButton } from "../googleLoginButton/GoogleLoginButton";
import { useNotification } from "../../context/notificationContextValue";

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

  const navigate = useNavigate();
  const location = useLocation();
  const { showNotification } = useNotification();

  if (!isOpen) return null;

  const finishLogin = () => {
    onClose();
    showNotification("Du er nå logget inn.");

    if (location.pathname === "/" || location.pathname === "/portfolio") {
      navigate("/portfolio", { replace: true });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Skriv inn e-postadressen din.");
      return;
    }
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError("Skriv inn en gyldig e-postadresse.");
      return;
    }
    if (!password) {
      setError("Skriv inn passordet ditt.");
      return;
    }

    setLoading(true);
    try {
      await login(trimmedEmail, password);
      finishLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Innlogging mislyktes.");
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
      setError(err instanceof Error ? err.message : "Google-innlogging mislyktes.");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="login-overlay" onMouseDown={onClose}>
      <section
        className="login-modal auth-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="auth-card__header">
          <span className="auth-card__eyebrow">Velkommen tilbake</span>
          <h2 id="login-modal-title">Logg inn</h2>
          <p>Få tilgang til samlingen og kontoen din.</p>
        </header>

        <div className="auth-card__google">
          <GoogleLoginButton
            disabled={loading}
            onClick={() => void handleGoogleLogin()}
          />
        </div>

        <div className="auth-divider"><span>eller</span></div>

        <form className="auth-form" onSubmit={handleLogin} noValidate>
          <label className="auth-field">
            <span>E-post</span>
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
            <span>Passord</span>
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
            {loading ? "Logger inn..." : "Logg inn"}
          </Button>
        </form>

        {error && (
          <p className="auth-notice auth-notice--error" role="alert">
            {error}
          </p>
        )}

        <div className="login-modal__close">
          <Button size="large" fullWidth onClick={onClose}>Lukk</Button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
