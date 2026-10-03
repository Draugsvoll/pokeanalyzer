type ErrorWithCode = {
  code?: unknown;
};

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/account-exists-with-different-credential":
    "An account already exists for this email address. Try another sign-in method.",
  "auth/cancelled-popup-request": "Sign-in was canceled. Please try again.",
  "auth/credential-already-in-use":
    "This sign-in method is already linked to another account.",
  "auth/email-already-in-use":
    "An account already exists for this email address.",
  "auth/email-not-verified":
    "Verify your email address before logging in. Check your inbox and spam folder.",
  "auth/invalid-credential": "The email address or password is incorrect.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/invalid-login-credentials":
    "The email address or password is incorrect.",
  "auth/missing-password": "Enter your password.",
  "auth/network-request-failed":
    "Check your internet connection and try again.",
  "auth/operation-not-allowed": "This sign-in method is currently unavailable.",
  "auth/popup-blocked":
    "Your browser blocked the sign-in window. Allow pop-ups and try again.",
  "auth/popup-closed-by-user":
    "The sign-in window was closed before login finished.",
  "auth/too-many-requests":
    "Too many attempts. Please wait a moment and try again.",
  "auth/unauthorized-domain":
    "Google sign-in is currently unavailable. Please try again later.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/user-not-found": "The email address or password is incorrect.",
  "auth/weak-password": "Choose a stronger password and try again.",
  "auth/wrong-password": "The email address or password is incorrect.",
};

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;

  const { code } = error as ErrorWithCode;
  return typeof code === "string" ? code : null;
}

export function getAuthErrorMessage(error: unknown, fallback: string) {
  const code = getErrorCode(error);
  return (code && AUTH_ERROR_MESSAGES[code]) || fallback;
}
