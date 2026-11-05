import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  signOut,
  signInWithPopup,
  signInWithEmailAndPassword,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { auth, db } from "../firebase";
import { initializeFreeSubscription } from "../subscriptions/subscriptionApi";
import { initializeEbaySignupCredits } from "../ebay/ebayCreditsApi";
import { logClientError } from "../utils/logClientError";
import { getUserProfileSessionKey } from "../utils/cache";

export async function deleteAccount(user: Pick<User, "uid" | "getIdToken">) {
  if (auth.currentUser?.uid !== user.uid) {
    throw new Error("The authenticated account changed; please try again.");
  }
  const token = await user.getIdToken();
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? "http://localhost:3001"}/api/account/me`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || "We couldn't delete your account. Please try again.",
    );
  }

  try {
    if (auth.currentUser?.uid === user.uid) await signOut(auth);
  } catch (error) {
    logClientError("Failed to sign out the deleted account locally", error);
  }
  try {
    sessionStorage.removeItem(getUserProfileSessionKey(user.uid));
  } catch (error) {
    logClientError(
      "Failed to clear the deleted account's local session",
      error,
    );
  }
}

async function initializeSignupCredits(user: User) {
  try {
    await initializeEbaySignupCredits(user);
  } catch (error) {
    // A temporary eBay failure must not prevent verification or signing in.
    logClientError("Failed to initialize signup Market credits", error);
  }
}

export async function register(email: string, password: string) {
  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    password,
  );
  await initializeSignupCredits(credential.user);
  return credential;
}

export async function login(email: string, password: string) {
  const userCredential = await signInWithEmailAndPassword(
    auth,
    email,
    password,
  );

  if (!userCredential.user.emailVerified) {
    await signOut(auth);
    throw Object.assign(
      new Error(
        "Verify your email address before logging in. Check your inbox and spam folder.",
      ),
      { code: "auth/email-not-verified" },
    );
  }

  await initializeFreeSubscription(userCredential.user);

  return userCredential;
}

export async function signInWithGoogle() {
  const userCredential = await signInWithPopup(auth, new GoogleAuthProvider());
  const { user } = userCredential;
  if (getAdditionalUserInfo(userCredential)?.isNewUser) {
    await initializeSignupCredits(user);
  }
  const userRef = doc(db, "users", user.uid);
  const userSnapshot = await getDoc(userRef);

  await setDoc(
    userRef,
    {
      uid: user.uid,
      ...(user.email && { email: user.email }),
      ...(user.displayName?.trim() && { firstName: user.displayName.trim() }),
      ...(!userSnapshot.exists() && { createdAt: serverTimestamp() }),
    },
    { merge: true },
  );

  await initializeFreeSubscription(user);
  return userCredential;
}
