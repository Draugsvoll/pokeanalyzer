const XAI_RESPONSES_URL = "https://api.x.ai/v1/responses";
const DEFAULT_GROK_MODEL = "grok-4.3";
const MAX_GROK_ATTEMPTS = 2;

type GrokResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
    type?: string;
  }>;
  error?: {
    code?: string;
    message?: string;
  };
};

export class GrokApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "GrokApiError";
    this.statusCode = statusCode;
  }
}

function getXaiApiKey() {
  const apiKey = process.env.XAI_API_KEY?.replace(/^(Bearer|Token)\s+/i, "").trim();

  if (!apiKey || apiKey === "your_xai_api_key_here") {
    throw new GrokApiError("Grok API key is not configured", 500);
  }

  return apiKey;
}

function getResponseText(data: GrokResponse) {
  if (data.output_text) {
    return data.output_text;
  }

  return (
    data.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .filter(Boolean)
      .join("\n")
      .trim() ?? ""
  );
}

export async function chat(text: string, signal?: AbortSignal) {
  return requestGrokResponse([
    {
      role: "user",
      content: text,
    },
  ], signal);
}

type GrokInputMessage = {
  role: "user";
  content:
    | string
    | Array<
        | { type: "input_text"; text: string }
        | { type: "input_image"; image_url: string }
      >;
};

export async function multimodalChat(
  input: GrokInputMessage[],
  signal?: AbortSignal,
) {
  return requestGrokResponse(input, signal);
}

async function requestGrokResponse(
  input: GrokInputMessage[],
  signal?: AbortSignal,
) {
  const apiKey = getXaiApiKey();

  for (let attempt = 1; attempt <= MAX_GROK_ATTEMPTS; attempt += 1) {
    try {
      return await requestGrokResponseOnce(input, apiKey, signal);
    } catch (error) {
      const shouldRetry =
        attempt < MAX_GROK_ATTEMPTS &&
        !signal?.aborted &&
        isRetryableGrokError(error);

      if (!shouldRetry) throw error;
      console.warn("Grok request failed; retrying once");
    }
  }

  throw new GrokApiError("Grok query request failed");
}

function isRetryableGrokError(error: unknown) {
  if (error instanceof GrokApiError) {
    return error.statusCode === 408 || error.statusCode === 429 || error.statusCode >= 500;
  }

  return (
    error instanceof TypeError ||
    (error instanceof DOMException && error.name === "TimeoutError") ||
    error instanceof SyntaxError
  );
}

async function requestGrokResponseOnce(
  input: GrokInputMessage[],
  apiKey: string,
  signal?: AbortSignal,
) {
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(120_000)])
    : AbortSignal.timeout(120_000);
  const response = await fetch(XAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_GROK_MODEL,
      temperature: 0.0,
      reasoning: {
        effort: "medium", // none | low | medium | high
      },
      instructions: "Answer the user's message clearly and concisely.",
      input,
      tools: [{ type: "web_search" }],
    }),
    signal: requestSignal,
  });

  const data = (await response.json()) as GrokResponse;

  if (!response.ok) {
    console.error(
      `Grok query request failed with status ${response.status}${
        data.error?.code ? ` and code ${data.error.code}` : ""
      }`
    );
    throw new GrokApiError("Grok query request failed", response.status);
  }

  const content = getResponseText(data);

  if (!content) {
    console.error("Grok returned no text content");
    throw new GrokApiError("Grok returned an empty response", 502);
  }

  return content;
}
