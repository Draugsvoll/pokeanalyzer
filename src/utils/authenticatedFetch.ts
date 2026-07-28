import { auth } from "../firebase";

export async function authenticatedFetch(
  input: string | URL,
  init: RequestInit = {},
  expectedUid?: string,
) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Log in to use this feature");
  }
  if (expectedUid && user.uid !== expectedUid) {
    throw new Error("The authenticated account changed; please try again");
  }
  if (!user.emailVerified) {
    throw new Error("Verify your email before using this feature");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await user.getIdToken()}`);

  return fetch(input, { ...init, headers });
}
