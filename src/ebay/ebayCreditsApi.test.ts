import type { User } from "firebase/auth";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  EBAY_CREDITS_REFRESH_EVENT,
  initializeEbaySignupCredits,
} from "./ebayCreditsApi";

vi.mock("../utils/authenticatedFetch", () => ({
  authenticatedFetch: vi.fn(),
}));

const fetchMock = vi.fn();
const user = {
  uid: "new-user",
  emailVerified: false,
  getIdToken: vi.fn(async () => "new-user-token"),
} as unknown as User;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("signup initializes market credits before verification and refreshes only eBay", async () => {
  fetchMock.mockResolvedValue({ ok: true });
  const dispatch = vi.spyOn(window, "dispatchEvent");
  await initializeEbaySignupCredits(user);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("/ebay/signup-credits"),
    expect.objectContaining({
      method: "POST",
      headers: { Authorization: "Bearer new-user-token" },
    }),
  );
  expect(dispatch.mock.calls.map(([event]) => event.type)).toEqual([
    EBAY_CREDITS_REFRESH_EVENT,
  ]);
  dispatch.mockRestore();
});

test("signup retries a temporary failure once", async () => {
  fetchMock
    .mockRejectedValueOnce(new Error("Connection lost"))
    .mockResolvedValueOnce({ ok: true });
  await initializeEbaySignupCredits(user);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("failed signup credit requests stop after one retry", async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 503 });
  await expect(initializeEbaySignupCredits(user)).rejects.toThrow(
    "Could not initialize signup Market credits",
  );
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
