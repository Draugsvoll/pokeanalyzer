import React, { useState } from "react";
import "./Signup.scss";

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
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
    setLoading(true); // these 3 prevents err msg persist
    try {
      if (formData.password !== formData.confirmPassword) {
        setError("Passordene er ikke like.");
        return;
      }
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password,
      );
      const userRef = doc(db, "users", userCredential.user.uid);
      const user: UserUpload = {
        uid: userCredential.user.uid,
        ...(formData.firstName.trim() && { firstName: formData.firstName.trim() }),
        email: formData.email,
        createdAt: serverTimestamp(),
      };
      await setDoc(userRef, user);
      await sendEmailVerification(userCredential.user);
      await signOut(auth);
      setSuccess("Konto opprettet! Sjekk e-posten din og bekreft adressen før du logger inn.");
    } catch (err: unknown) {
      logClientError("Signup failed", err);
      setError(err instanceof Error ? err.message : "Noe gikk galt under registrering.");
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
      showNotification("Du er nå logget inn.");
      navigate("/profile");
    } catch (err: unknown) {
      logClientError("Google sign-in failed", err);
      setError(err instanceof Error ? err.message : "Google-innlogging mislyktes.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-page">
      <section className="signup-card auth-card" aria-labelledby="signup-title">
        <header className="auth-card__header">
          <span className="auth-card__eyebrow">Ny samler</span>
          <h1 id="signup-title">Opprett konto</h1>
          <p>Opprett en konto og begynn å bygge samlingen din.</p>
        </header>

        <div className="auth-card__google">
          <GoogleLoginButton
            disabled={loading}
            onClick={() => void handleGoogleSignIn()}
          />
        </div>

        <div className="auth-divider"><span>eller</span></div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Navn (valgfritt)</span>
            <input
              name="firstName"
              placeholder="Navnet ditt"
              value={formData.firstName}
              onChange={handleChange}
              autoComplete="name"
            />
          </label>

          <label className="auth-field">
            <span>E-post</span>
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
            <span>Passord</span>
            <input
              name="password"
              type="password"
              placeholder="Velg et passord"
              value={formData.password}
              onChange={handleChange}
              autoComplete="new-password"
              required
            />
          </label>

          <label className="auth-field">
            <span>Gjenta passord</span>
            <input
              name="confirmPassword"
              type="password"
              placeholder="Gjenta passordet"
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
            {loading ? "Oppretter konto..." : "Opprett konto"}
          </Button>
        </form>
      </section>
    </div>
  );
}
