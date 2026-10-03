import React, { useState } from "react";
import "./Signup.scss";

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  validatePassword,
  type PasswordValidationStatus,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { useNavigate } from "react-router-dom";
import Button from "../../components/button/Button";
import type { UserUpload } from "../../types/user.types";
import { signInWithGoogle } from "../../services/auth";
import { GoogleLoginButton } from "../../components/googleLoginButton/GoogleLoginButton";
import { logClientError } from "../../utils/logClientError";
import { useNotification } from "../../context/notificationContextValue";
import { getAuthErrorMessage } from "../../utils/userFacingError";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getPasswordPolicyError(status: PasswordValidationStatus) {
  const requirements: string[] = [];
  const options = status.passwordPolicy.customStrengthOptions;

  if (status.meetsMinPasswordLength === false) {
    requirements.push(`at least ${options.minPasswordLength ?? 6} characters`);
  }
  if (status.meetsMaxPasswordLength === false && options.maxPasswordLength) {
    requirements.push(`no more than ${options.maxPasswordLength} characters`);
  }
  if (status.containsLowercaseLetter === false) {
    requirements.push("a lowercase letter");
  }
  if (status.containsUppercaseLetter === false) {
    requirements.push("an uppercase letter");
  }
  if (status.containsNumericCharacter === false) {
    requirements.push("a number");
  }
  if (status.containsNonAlphanumericCharacter === false) {
    requirements.push("a special character");
  }

  return requirements.length
    ? `Your password must include ${requirements.join(", ")}.`
    : "Your password does not meet the requirements.";
}

export default function SignUpForm() {
  const [formData, setFormData] = useState({
    firstName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // prevent double submit
    setError("");
    setSuccess("");

    const trimmedEmail = formData.email.trim();
    if (!trimmedEmail) {
      setError("Enter your email address.");
      return;
    }
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!formData.password) {
      setError("Choose a password.");
      return;
    }
    if (!formData.confirmPassword) {
      setError("Repeat your password.");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const passwordStatus = await validatePassword(auth, formData.password);
      if (!passwordStatus.isValid) {
        setError(getPasswordPolicyError(passwordStatus));
        return;
      }

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        trimmedEmail,
        formData.password,
      );
      const userRef = doc(db, "users", userCredential.user.uid);
      const user: UserUpload = {
        uid: userCredential.user.uid,
        ...(formData.firstName.trim() && {
          firstName: formData.firstName.trim(),
        }),
        email: trimmedEmail,
        createdAt: serverTimestamp(),
      };
      await setDoc(userRef, user);
      await sendEmailVerification(userCredential.user);
      await signOut(auth);
      setSuccess(
        "Account created. Check your email and verify your address before logging in.",
      );
    } catch (err: unknown) {
      logClientError("Signup failed", err);
      setError(
        getAuthErrorMessage(
          err,
          "We couldn’t create your account. Please try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (loading) return;

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      await signInWithGoogle();
      showNotification("You are now logged in.");
      navigate("/profile");
    } catch (err: unknown) {
      logClientError("Google sign-in failed", err);
      setError(
        getAuthErrorMessage(
          err,
          "We couldn’t sign you in with Google. Please try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-page">
      <section className="signup-card auth-card" aria-labelledby="signup-title">
        <header className="auth-card__header">
          <span className="auth-card__eyebrow">New collector</span>
          <h1 id="signup-title">Create account</h1>
          <p>Create an account and start building your collection.</p>
        </header>

        <div className="auth-card__google">
          <GoogleLoginButton
            disabled={loading}
            onClick={() => void handleGoogleSignIn()}
          />
        </div>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="auth-field">
            <span>Name (optional)</span>
            <input
              name="firstName"
              placeholder="Your name"
              value={formData.firstName}
              onChange={handleChange}
              autoComplete="name"
            />
          </label>

          <label className="auth-field">
            <span>Email</span>
            <input
              name="email"
              type="email"
              placeholder="name@example.com"
              value={formData.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              placeholder="Choose a password"
              value={formData.password}
              onChange={handleChange}
              autoComplete="new-password"
              required
            />
            <small className="auth-field__hint">At least 6 characters.</small>
          </label>

          <label className="auth-field">
            <span>Repeat password</span>
            <input
              name="confirmPassword"
              type="password"
              placeholder="Repeat your password"
              value={formData.confirmPassword}
              onChange={handleChange}
              autoComplete="new-password"
              required
            />
          </label>

          {error && (
            <p className="auth-notice auth-notice--error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="auth-notice auth-notice--success" role="status">
              {success}
            </p>
          )}

          <Button
            type="submit"
            variant="auth"
            size="large"
            fullWidth
            disabled={loading}
          >
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>
      </section>
    </div>
  );
}
