import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signOut,
  signInWithPopup,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { auth, db } from "../firebase";
import { initializeFreeSubscription } from "../subscriptions/subscriptionApi";

export async function register(
  email: string,
  password: string
) {
  return createUserWithEmailAndPassword(
    auth,
    email,
    password
  );
}

export async function login(
  email: string,
  password: string
) {
  const userCredential = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  if (!userCredential.user.emailVerified) {
    await signOut(auth);
    throw new Error("Bekreft e-postadressen din før du logger inn. Sjekk innboksen og søppelpost.");
  }

  return userCredential;
}

export async function signInWithGoogle() {
  const userCredential = await signInWithPopup(auth, new GoogleAuthProvider());
  const { user } = userCredential;
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
