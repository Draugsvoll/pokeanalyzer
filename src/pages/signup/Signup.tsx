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
  const navigate = useNavigate()

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
      navigate("/profile");
    } catch (err: unknown) {
      logClientError("Google sign-in failed", err);
      setError(err instanceof Error ? err.message : "Google-innlogging mislyktes.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-container">
      <h1>Pokémon Marketplace</h1>
      <p>Opprett konto for kjøp, salg og bytte av Pokémon-kort.</p>

      <form className="signup-form" onSubmit={handleSubmit}>
        <GoogleLoginButton
          disabled={loading}
          onClick={() => void handleGoogleSignIn()}
        />

        <div className="signup-divider"><span>eller</span></div>

        <input name="firstName" placeholder="Navn (valgfritt)" value={formData.firstName} onChange={handleChange} />
        <input name="email" type="email" placeholder="E-post" value={formData.email} onChange={handleChange} required />
        <br />
        <input name="password" type="password" placeholder="Passord" value={formData.password} onChange={handleChange} required />
        <input name="confirmPassword" type="password" placeholder="Gjenta passord" value={formData.confirmPassword} onChange={handleChange} required />
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <Button type="submit" disabled={loading} variant="primary">
          {loading ? "Oppretter konto..." : "Opprett konto"}
        </Button>
      </form>
    </div>
  );
}
