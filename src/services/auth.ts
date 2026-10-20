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

async function initializeSignupCredits(user: User) {
  try {
    await initializeEbaySignupCredits(user);
  } catch (error) {
    // A temporary eBay failure must not prevent verification or signing in.
    logClientError("Failed to initialize signup eBay credits", error);
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
