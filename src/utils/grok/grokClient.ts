const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type GrokTestResponse = {
  text?: string;
  error?: string;
};

export type GrokResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export type GrokRequestState = {
  loading: boolean;
  error: string;
  response: string;
};

export async function askGrok(prompt: string): Promise<GrokResult> {
  try {
    const params = new URLSearchParams({ q: prompt });
    const res = await fetch(`${API_URL}/grok?${params.toString()}`);
    const data = (await res.json()) as GrokTestResponse;

    if (!res.ok) {
      return { ok: false, error: data.error ?? "Grok request failed" };
    }

    return { ok: true, text: data.text ?? "" };
  } catch {
    return { ok: false, error: "Could not reach the Grok endpoint" };
  }
}
