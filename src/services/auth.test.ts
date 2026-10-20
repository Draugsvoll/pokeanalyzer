import { beforeEach, expect, test, vi } from "vitest";
import { login, register, signInWithGoogle } from "./auth";

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
vi.mock("../firebase", () => ({ auth: {}, db: {} }));
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
};
const credential = { user };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.create.mockResolvedValue(credential);
  mocks.popup.mockResolvedValue(credential);
  mocks.signIn.mockResolvedValue(credential);
  mocks.getDoc.mockResolvedValue({ exists: () => false });
  mocks.additionalInfo.mockReturnValue({ isNewUser: false });
});

test("email signup grants the new account's eBay credits before returning", async () => {
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
