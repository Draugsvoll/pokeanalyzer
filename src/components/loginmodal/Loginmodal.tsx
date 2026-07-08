import { useState } from "react";
import { useNavigate } from "react-router-dom";
import './Loginmodal.scss';
import Button from "../button/Button";
import { login } from "../../services/auth";

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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

return (
  <div className="overlay">
    <div className="modal">
      <h2>Logg inn</h2>

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