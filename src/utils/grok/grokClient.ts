import type { CreditUsageFeature, UserSubscription } from "../../subscriptions/types";
import { authenticatedFetch } from "../authenticatedFetch";
import { isAbortError } from "../../hooks/useAbortableRequest";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type GrokResponse = {
  text?: string;
  error?: string;
  subscription?: UserSubscription;
  fromDatabase?: boolean;
};

export type GrokResult =
  | { ok: true; text: string; subscription: UserSubscription; fromDatabase: boolean }
  | { ok: false; error: string };

export type GrokRequestState = {
  loading: boolean;
  error: string;
  response: string;
};

export type IndependentAnalysisResult =
  | { fromDatabase: boolean; ok: true; text: string }
  | { ok: false };

type MarketPricesResponse = {
  error?: string;
  priceAnalysis?: IndependentAnalysisResult;
  salesData?: IndependentAnalysisResult;
  subscription?: UserSubscription;
};

export type MarketPricesResult =
  | {
      ok: true;
      priceAnalysis: IndependentAnalysisResult;
      salesData: IndependentAnalysisResult;
      subscription: UserSubscription;
    }
  | { ok: false };

export async function askMarketPrices(
  cardId: string,
  signal?: AbortSignal,
): Promise<MarketPricesResult> {
  try {
    const res = await authenticatedFetch(`${API_URL}/ai/market-prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId }),
      signal,
    });
    const data = (await res.json()) as MarketPricesResponse;

    if (
      !res.ok ||
      !data.subscription ||
      !data.priceAnalysis ||
      !data.salesData
    ) {
      return { ok: false };
    }

    return {
      ok: true,
      priceAnalysis: data.priceAnalysis,
      salesData: data.salesData,
      subscription: data.subscription,
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return { ok: false };
  }
}

export async function askGrok(
  prompt: string,
  feature: CreditUsageFeature,
  signal?: AbortSignal,
  cardId?: string,
): Promise<GrokResult> {
  try {
    const res = await authenticatedFetch(`${API_URL}/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, feature, cardId }),
      signal,
    });
    const data = (await res.json()) as GrokResponse;

    if (!res.ok) {
      return { ok: false, error: data.error ?? "AI request failed" };
    }
    if (!data.subscription) {
      return { ok: false, error: "AI response did not include subscription data" };
    }

    return {
      ok: true,
      text: data.text ?? "",
      subscription: data.subscription,
      fromDatabase: Boolean(data.fromDatabase),
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not reach the AI endpoint",
    };
  }
}
