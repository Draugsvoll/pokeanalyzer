import { useState } from "react";
import { useNavigate } from "react-router-dom";
import './Loginmodal.scss';
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

return (
  <div className="overlay">
    <div className="modal">
      <h2>Logg inn</h2>

      <GoogleLoginButton
        disabled={loading}
        onClick={() => void handleGoogleLogin()}
      />

      <div className="login-divider"><span>eller</span></div>

      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="E-post"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
        />

        <input
          type="password"
          placeholder="Passord"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
        />

        <Button
          type="submit"
          disabled={loading}
          className="button"
        >
          {loading ? "Logger inn..." : "Logg inn"}
        </Button>
      </form>

      {error && <p className="error">{error}</p>}

      <Button onClick={onClose} className="close">
        Lukk
      </Button>
    </div>
  </div>
)}
