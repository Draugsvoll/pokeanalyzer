import React, { useState } from "react";
import "./Signup.scss";

import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { useNavigate } from "react-router-dom";
import Button from "../../components/button/Button";
import type { UserUpload } from "../../types/user.types";

export default function SignUpForm() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
    city: "",
    address: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const navigate = useNavigate()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    e.target.value = "";
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
      const username = formData.username
      await updateProfile(userCredential.user, {
        displayName: username,
      });

      // Storage is not enabled yet. Keep avatar selection ready, but skip upload for now.
      // const avatar = avatarFile ? await uploadAvatar(avatarFile) : null;
      const avatar: string | null = null;

      const userRef = doc(db, "users", userCredential.user.uid);
      const user: UserUpload = {
        uid: userCredential.user.uid,
        firstName: formData.firstName,
        lastName: formData.lastName,
        username: username,
        email: formData.email,
        city: formData.city,
        address: formData.address,
        avatar,
        createdAt: serverTimestamp(),
      };
      await setDoc(userRef, user);
      setSuccess("Konto opprettet!");
      setAvatarFile(null);
      setAvatarPreview(null);
      navigate('/profile')
    } catch (err: any) {
      console.error("SIGNUP ERROR:", err);
      setError(err?.message || "Noe gikk galt under registrering.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-container">
      <div>loading: {loading.toString()}</div>

      <h1>Pokémon Marketplace</h1>
      <p>Opprett konto for kjøp, salg og bytte av Pokémon-kort.</p>

      <form className="signup-form" onSubmit={handleSubmit}>
        <input name="firstName" placeholder="Fornavn" value={formData.firstName} onChange={handleChange} required />
        <input name="lastName" placeholder="Etternavn" value={formData.lastName} onChange={handleChange} required />
        <input name="email" type="email" placeholder="E-post" value={formData.email} onChange={handleChange} required />
        <input name="username" placeholder="Brukernavn" value={formData.username} onChange={handleChange} required />
        <input name="password" type="password" placeholder="Passord" value={formData.password} onChange={handleChange} required />
        <input name="confirmPassword" type="password" placeholder="Gjenta passord" value={formData.confirmPassword} onChange={handleChange} required />
        <input name="city" placeholder="By/Sted" value={formData.city} onChange={handleChange} required />
        <input name="address" placeholder="Adresse" value={formData.address} onChange={handleChange} required />
        <input type="file" accept="image/*" onChange={handleAvatarChange} />

        {avatarPreview && (
          <img
            className="signup-avatar-preview"
            src={avatarPreview}
            alt="Avatar preview"
          />
        )}

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <Button type="submit" disabled={loading} variant="primary">
          {loading ? "Oppretter konto..." : "Opprett konto"}
        </Button>
      </form>
    </div>
  );
}
