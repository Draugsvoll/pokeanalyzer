import type {
  CreditUsageFeature,
  UserSubscription,
} from "../../subscriptions/types";
import { authenticatedFetch } from "../authenticatedFetch";
import { isAbortError } from "../../hooks/useAbortableRequest";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type GrokResponse = {
  text?: string;
  subscription?: UserSubscription;
  fromDatabase?: boolean;
};

export type GrokResult =
  | {
      ok: true;
      text: string;
      subscription: UserSubscription;
      fromDatabase: boolean;
    }
  | { ok: false; error: string };

export type GrokRequestState = {
  loading: boolean;
  error: string;
  response: string;
};

type AskGrokOptions = {
  cardName?: string;
  cardNumber?: string;
  cardId?: string;
  instructions?: string;
  setName?: string;
  signal?: AbortSignal;
  userInput?: string;
  variantName?: string;
};

export async function askGrok(
  feature: CreditUsageFeature,
  options: AskGrokOptions = {},
): Promise<GrokResult> {
  try {
    const {
      cardId,
      cardName,
      cardNumber,
      instructions,
      setName,
      signal,
      userInput,
      variantName,
    } = options;
    const res = await authenticatedFetch(`${API_URL}/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feature,
        userInput,
        cardId,
        name: cardName,
        cardNumber,
        set: setName,
        variant: variantName,
        instructions,
      }),
      signal,
    });
    const data = (await res.json()) as GrokResponse;

    if (!res.ok) {
      return {
        ok: false,
        error:
          res.status === 409
            ? "This feature is currently unavailable."
            : res.status === 429
              ? "This feature is busy right now. Please try again shortly."
              : "We couldn’t complete this request. Please try again.",
      };
    }
    if (!data.subscription) {
      return {
        ok: false,
        error: "We couldn’t complete this request. Please try again.",
      };
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
      error: "We couldn’t complete this request. Please try again.",
    };
  }
}
