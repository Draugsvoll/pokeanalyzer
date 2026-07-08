const XAI_RESPONSES_URL = "https://api.x.ai/v1/responses";
const DEFAULT_GROK_MODEL = "grok-4.3";

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

export async function testChat(text: string) {
  const response = await fetch(XAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getXaiApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_GROK_MODEL,
      temperature: 0.0,
      reasoning: {
        effort: "high", // none | low | medium | high
      },
      instructions: "Answer the user's message clearly and concisely.",
      input: [
        {
          role: "user",
          content: text,
        },
      ],
      tools: [{ type: "web_search" }],
    }),
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
    console.error("Grok returned no text content", JSON.stringify(data, null, 2));
    throw new GrokApiError("Grok returned an empty response", 502);
  }

  return content;
}
