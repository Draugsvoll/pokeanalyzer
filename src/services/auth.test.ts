import { beforeEach, expect, test, vi } from "vitest";
import { deleteAccount, login, register, signInWithGoogle } from "./auth";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  popup: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  additionalInfo: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  initializeSubscription: vi.fn(),
  initializeEbay: vi.fn(),
  logError: vi.fn(),
  auth: { currentUser: null as { uid: string } | null },
}));

vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: mocks.create,
  getAdditionalUserInfo: mocks.additionalInfo,
  GoogleAuthProvider: class {},
  signInWithPopup: mocks.popup,
  signInWithEmailAndPassword: mocks.signIn,
  signOut: mocks.signOut,
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => "user-ref"),
  getDoc: mocks.getDoc,
  setDoc: mocks.setDoc,
  serverTimestamp: vi.fn(() => "server-time"),
}));
vi.mock("../firebase", () => ({ auth: mocks.auth, db: {} }));
vi.mock("../subscriptions/subscriptionApi", () => ({
  initializeFreeSubscription: mocks.initializeSubscription,
}));
vi.mock("../ebay/ebayCreditsApi", () => ({
  initializeEbaySignupCredits: mocks.initializeEbay,
}));
vi.mock("../utils/logClientError", () => ({
  logClientError: mocks.logError,
}));

const user = {
  uid: "user-1",
  email: "user@example.com",
  emailVerified: true,
  getIdToken: vi.fn(),
};
const credential = { user };

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  mocks.auth.currentUser = user;
  user.getIdToken.mockResolvedValue("auth-token");
  mocks.create.mockResolvedValue(credential);
  mocks.popup.mockResolvedValue(credential);
  mocks.signIn.mockResolvedValue(credential);
  mocks.getDoc.mockResolvedValue({ exists: () => false });
  mocks.additionalInfo.mockReturnValue({ isNewUser: false });
});

test("account deletion authenticates the request, clears its profile cache and signs out", async () => {
  const request = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ deleted: true })));
  vi.stubGlobal("fetch", request);
  sessionStorage.setItem("user_profile_user-1", "cached");
  await deleteAccount(user);
  expect(request).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/account\/me$/),
    {
      method: "DELETE",
      headers: { Authorization: "Bearer auth-token" },
    },
  );
  expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith(mocks.auth);
  expect(sessionStorage.getItem("user_profile_user-1")).toBeNull();
});

test("rejected account deletion preserves the session and shows the server message", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ message: "Cancel your subscription first." }),
          { status: 409 },
        ),
      ),
  );
  sessionStorage.setItem("user_profile_user-1", "cached");
  await expect(deleteAccount(user)).rejects.toThrow(
    "Cancel your subscription first.",
  );
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(sessionStorage.getItem("user_profile_user-1")).toBe("cached");
});

test("account deletion cannot start for a different signed-in user", async () => {
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  mocks.auth.currentUser = { uid: "other-user" };
  await expect(deleteAccount(user)).rejects.toThrow(
    "authenticated account changed",
  );
  expect(request).not.toHaveBeenCalled();
});

test("successful deletion does not sign out a different user who signed in while waiting", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => {
      mocks.auth.currentUser = { uid: "other-user" };
      return new Response(JSON.stringify({ deleted: true }));
    }),
  );
  await deleteAccount(user);
  expect(mocks.signOut).not.toHaveBeenCalled();
});

test("local sign-out failure does not turn successful account deletion into an error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ deleted: true }))),
  );
  mocks.signOut.mockRejectedValue(new Error("Local storage unavailable"));
  await expect(deleteAccount(user)).resolves.toBeUndefined();
  expect(mocks.logError).toHaveBeenCalledOnce();
});

test("email signup grants the new account's market credits before returning", async () => {
  expect(await register("user@example.com", "password")).toBe(credential);
  expect(mocks.initializeEbay).toHaveBeenCalledExactlyOnceWith(user);
  expect(mocks.initializeSubscription).not.toHaveBeenCalled();
});

test("failed account creation never grants credits", async () => {
  mocks.create.mockRejectedValue(new Error("Email already exists"));
  await expect(register("user@example.com", "password")).rejects.toThrow(
    "Email already exists",
  );
  expect(mocks.initializeEbay).not.toHaveBeenCalled();
});

test("ordinary email login does not grant a signup bonus", async () => {
  await login("user@example.com", "password");
  expect(mocks.initializeEbay).not.toHaveBeenCalled();
  expect(mocks.initializeSubscription).toHaveBeenCalledExactlyOnceWith(user);
});

test("Google grants signup credits only when Firebase reports a new account", async () => {
  mocks.additionalInfo.mockReturnValue({ isNewUser: true });
  await signInWithGoogle();
  expect(mocks.initializeEbay).toHaveBeenCalledExactlyOnceWith(user);
});

test("existing Google accounts get no signup bonus, even with a missing profile", async () => {
  await signInWithGoogle();
  expect(mocks.setDoc).toHaveBeenCalled();
  expect(mocks.initializeEbay).not.toHaveBeenCalled();
});

test("an eBay initialization failure does not block email verification or Google login", async () => {
  mocks.initializeEbay.mockRejectedValue(new Error("eBay unavailable"));
  expect(await register("user@example.com", "password")).toBe(credential);
  mocks.additionalInfo.mockReturnValue({ isNewUser: true });
  expect(await signInWithGoogle()).toBe(credential);
  expect(mocks.initializeSubscription).toHaveBeenCalledExactlyOnceWith(user);
  expect(mocks.logError).toHaveBeenCalledTimes(2);
});
