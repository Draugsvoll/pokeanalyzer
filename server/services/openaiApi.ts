const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

type OpenAiResponse = {
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

export class OpenAiApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "OpenAiApiError";
    this.statusCode = statusCode;
  }
}

function getOpenAiApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.replace(/^(Bearer|Token)\s+/i, "").trim();

  if (!apiKey || apiKey === "your_openai_api_key_here") {
    throw new OpenAiApiError("OpenAI API key is not configured", 500);
  }

  return apiKey;
}

function getResponseText(data: OpenAiResponse) {
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

export async function testOpenAiChat(text: string) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
      instructions: "Answer the user's message clearly and concisely.",
      input: text,
    }),
  });

  const data = (await response.json()) as OpenAiResponse;

  if (!response.ok) {
    console.error(
      `OpenAI query request failed with status ${response.status}${
        data.error?.code ? ` and code ${data.error.code}` : ""
      }`
    );
    throw new OpenAiApiError("OpenAI query request failed", response.status);
  }

  const content = getResponseText(data);

  if (!content) {
    console.error("OpenAI returned no text content");
    throw new OpenAiApiError("OpenAI returned an empty response", 502);
  }

  return content;
}
