import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import "./Loginmodal.scss";
import Button from "../button/Button";
import { login, signInWithGoogle } from "../../services/auth";
import { GoogleLoginButton } from "../googleLoginButton/GoogleLoginButton";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function LoginModal({ isOpen, onClose }: ModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      onClose();
      navigate("/profile", { replace: true });
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
      onClose();
      navigate("/profile", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google-innlogging mislyktes.");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="login-overlay">
      <section
        className="login-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
      >
        <header className="login-modal__header">
          <span className="login-modal__eyebrow">Welcome back</span>
          <h2 id="login-modal-title">Logg inn</h2>
          <p>Access your collection and account.</p>
        </header>

        <GoogleLoginButton
          disabled={loading}
          onClick={() => void handleGoogleLogin()}
        />

        <div className="login-divider"><span>eller</span></div>

        <form className="login-modal__form" onSubmit={handleLogin}>
          <label className="login-modal__field">
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

          <label className="login-modal__field">
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
            disabled={loading}
            className="login-modal__submit"
          >
            {loading ? "Logger inn..." : "Logg inn"}
          </Button>
        </form>

        {error && (
          <p className="login-modal__error" role="alert">
            {error}
          </p>
        )}

        <Button onClick={onClose} className="login-modal__close">
          Lukk
        </Button>
      </section>
    </div>,
    document.body,
  );
}
