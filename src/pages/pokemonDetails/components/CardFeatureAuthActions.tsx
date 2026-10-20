import { useState } from "react";
import Button from "../../../components/button/Button";
import { GoogleLoginButton } from "../../../components/googleLoginButton/GoogleLoginButton";
import { signInWithGoogle } from "../../../services/auth";
import {
  getCustomColors,
  type CustomColors,
} from "../../../utils/customStylings";
import { logClientError } from "../../../utils/logClientError";

export function CardFeatureAuthActions({
  color,
  onSignup,
  onLogin,
}: {
  color: CustomColors;
  onSignup: () => void;
  onLogin: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleGoogleAuth() {
    if (loading) return;
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      logClientError("Google sign-in failed", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="card-feature-header__auth-row">
        <Button
          fill="ghost"
          size="large"
          style={getCustomColors(color)}
          onClick={onSignup}
        >
          Sign up
        </Button>
        <Button
          fill="solid"
          size="large"
          style={getCustomColors(color)}
          onClick={onLogin}
        >
          Log in
        </Button>
      </div>
      <span className="card-feature-header__auth-divider">or</span>
      <GoogleLoginButton
        disabled={loading}
        onClick={() => void handleGoogleAuth()}
      />
    </>
  );
}
