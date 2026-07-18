import type { CreditUsageFeature, UserSubscription } from "../../subscriptions/types";
import { authenticatedFetch } from "../authenticatedFetch";
import { isAbortError } from "../../hooks/useAbortableRequest";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type GrokResponse = {
  text?: string;
  error?: string;
  subscription?: UserSubscription;
};

export type GrokResult =
  | { ok: true; text: string; subscription: UserSubscription }
  | { ok: false; error: string };

export type GrokRequestState = {
  loading: boolean;
  error: string;
  response: string;
};

export async function askGrok(
  prompt: string,
  feature: CreditUsageFeature,
  signal?: AbortSignal,
): Promise<GrokResult> {
  try {
    const res = await authenticatedFetch(`${API_URL}/grok`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, feature }),
      signal,
    });
    const data = (await res.json()) as GrokResponse;

    if (!res.ok) {
      return { ok: false, error: data.error ?? "Grok request failed" };
    }
    if (!data.subscription) {
      return { ok: false, error: "Grok response did not include subscription data" };
    }

    return { ok: true, text: data.text ?? "", subscription: data.subscription };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not reach the Grok endpoint",
    };
  }
}
