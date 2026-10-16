import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: {},
  order: [] as string[],
  initializeAppCheck: vi.fn(),
}));

vi.mock("firebase/app", () => ({ initializeApp: () => mocks.app }));
vi.mock("firebase/app-check", () => ({
  initializeAppCheck: mocks.initializeAppCheck,
  ReCaptchaEnterpriseProvider: class {
    siteKey: string;
    constructor(siteKey: string) {
      this.siteKey = siteKey;
    }
  },
}));
vi.mock("firebase/auth", () => ({
  getAuth: () => {
    mocks.order.push("auth");
    return {};
  },
}));
vi.mock("firebase/firestore", () => ({
  getFirestore: () => {
    mocks.order.push("firestore");
    return {};
  },
}));

beforeEach(() => {
  vi.resetModules();
  mocks.order.length = 0;
  mocks.initializeAppCheck.mockReset().mockImplementation(() => {
    mocks.order.push("app-check");
  });
  vi.stubGlobal("FIREBASE_APPCHECK_DEBUG_TOKEN", undefined);
  vi.stubEnv("VITE_FIREBASE_APPCHECK_SITE_KEY", " test-site-key ");
  vi.stubEnv("DEV", false);
  vi.stubEnv("PROD", true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("initializes App Check before Firebase services without production debug mode", async () => {
  await import("./firebase");
  expect(mocks.order).toEqual(["app-check", "auth", "firestore"]);
  expect(mocks.initializeAppCheck).toHaveBeenCalledWith(mocks.app, {
    provider: expect.objectContaining({ siteKey: "test-site-key" }),
    isTokenAutoRefreshEnabled: true,
  });
  expect(self.FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
});

test("enables local debug tokens before App Check initializes", async () => {
  vi.stubEnv("DEV", true);
  vi.stubEnv("PROD", false);
  mocks.initializeAppCheck.mockImplementation(() => {
    expect(self.FIREBASE_APPCHECK_DEBUG_TOKEN).toBe(true);
  });
  await import("./firebase");
  expect(mocks.initializeAppCheck).toHaveBeenCalledOnce();
});

test.each([undefined, "", "   "])(
  "allows local Firebase initialization without App Check when the key is %j",
  async (key) => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("PROD", false);
    vi.stubEnv("VITE_FIREBASE_APPCHECK_SITE_KEY", key);
    await import("./firebase");
    expect(mocks.initializeAppCheck).not.toHaveBeenCalled();
    expect(mocks.order).toEqual(["auth", "firestore"]);
    expect(self.FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
  },
);
