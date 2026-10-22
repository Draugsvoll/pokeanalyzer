import type { User } from "firebase/auth";
import type { EbayCredits } from "../../shared/ebayCredits";
import { authenticatedFetch } from "../utils/authenticatedFetch";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
export const EBAY_CREDITS_REFRESH_EVENT = "pokeanalyzer:ebay-credits-refresh";

export function parseEbayCredits(value: unknown): EbayCredits {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid eBay credit balance");
  }
  const balance = value as Record<string, unknown>;
  const counters = [
    "membershipCreditsRemaining",
    "membershipCreditsTotal",
    "membershipCreditsUsed",
    "bonusCreditsRemaining",
    "bonusCreditsTotal",
    "bonusCreditsUsed",
    "creditsRemaining",
    "version",
  ];
  if (
    counters.some(
      (key) => !Number.isSafeInteger(balance[key]) || Number(balance[key]) < 0,
    ) ||
    typeof balance.planId !== "string" ||
    (balance.currentPeriodEnd !== undefined &&
      typeof balance.currentPeriodEnd !== "string")
  ) {
    throw new Error("Invalid eBay credit balance");
  }
  return value as EbayCredits;
}

export async function fetchEbayCredits(uid: string, signal: AbortSignal) {
  const response = await authenticatedFetch(
    `${API_URL}/ebay/credits`,
    { signal, cache: "no-store" },
    uid,
  );
  if (!response.ok) throw new Error("Could not load Ebay credits");
  const body: unknown = await response.json();
  return parseEbayCredits(
    body && typeof body === "object" && "credits" in body
      ? body.credits
      : undefined,
  );
}

// Signup happens before email verification, so this uses the new account's token
// directly. Listing requests and ordinary balance reads still require verification.
export async function initializeEbaySignupCredits(user: User) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${API_URL}/ebay/signup-credits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error("Could not initialize signup Ebay credits");
      }
      window.dispatchEvent(new Event(EBAY_CREDITS_REFRESH_EVENT));
      return;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
}
