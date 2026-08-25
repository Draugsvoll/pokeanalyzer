const XAI_RESPONSES_URL = "https://api.x.ai/v1/responses";
type GrokModel = "grok-4.3" | "grok-4.5";
type GrokReasoningEffort = "low" | "medium" | "high";

const DEFAULT_GROK_MODEL: GrokModel = "grok-4.3";
const DEFAULT_REASONING_EFFORT: GrokReasoningEffort = "medium";
const DEFAULT_INSTRUCTIONS = "Answer clearly";

type GrokResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
    type?: string;
  }>;
  error?:
    | {
        code?: string;
        message?: string;
      }
    | string;
};

export type GrokChatOptions = {
  instructions?: string;
  model?: GrokModel;
  reasoningEffort?: GrokReasoningEffort;
  signal?: AbortSignal;
  useCodeInterpreter?: boolean;
};

type NormalizedGrokChatOptions = {
  instructions: string;
  model: GrokModel;
  reasoningEffort: GrokReasoningEffort;
  signal?: AbortSignal;
  useCodeInterpreter: boolean;
};

type GrokTool = { type: "web_search" | "code_interpreter" };

type GrokResponseFormat = {
  format: {
    type: "json_object";
  };
};

type GrokRequestPayload = {
  model: GrokModel;
  temperature: number;
  reasoning: {
    effort: GrokReasoningEffort;
  };
  input: GrokInputMessage[];
  tools: GrokTool[];
  text: GrokResponseFormat;
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
  const apiKey = process.env.XAI_API_KEY?.replace(
    /^(Bearer|Token)\s+/i,
    "",
  ).trim();

  if (!apiKey || apiKey === "your_xai_api_key_here") {
    throw new GrokApiError("AI API key is not configured", 500);
  }

  return apiKey;
}

export async function chat(text: string, options: GrokChatOptions = {}) {
  return requestGrokResponse(
    [
      {
        role: "user",
        content: text,
      },
    ],
    options,
  );
}

export async function chatWithRawResponse(
  text: string,
  options: GrokChatOptions = {},
) {
  return requestGrokResponseWithRaw(
    [
      {
        role: "user",
        content: text,
      },
    ],
    options,
  );
}

type GrokInputMessage = {
  role: "system" | "user";
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
  return requestGrokResponse(input, { signal });
}

async function requestGrokResponse(
  input: GrokInputMessage[],
  options: GrokChatOptions = {},
) {
  const result = await requestGrokResponseWithRaw(input, options);
  return result.text;
}

async function requestGrokResponseWithRaw(
  input: GrokInputMessage[],
  options: GrokChatOptions = {},
) {
  const apiKey = getXaiApiKey();
  const normalizedOptions = normalizeGrokChatOptions(options);

  return requestGrokResponseOnce(input, apiKey, normalizedOptions);
}

async function requestGrokResponseOnce(
  input: GrokInputMessage[],
  apiKey: string,
  options: NormalizedGrokChatOptions,
) {
  const requestSignal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(300_000)])
    : AbortSignal.timeout(300_000);
  const payload = buildGrokRequestPayload(input, options);
  logGrokRequestDebug(payload);

  const response = await fetch(XAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: requestSignal,
  });

  const data = (await response.json()) as GrokResponse;

  if (!response.ok) {
    const detail = getGrokErrorDetail(data);
    logGrokErrorDebug(data);
    console.error(
      `AI query request failed with status ${response.status}${
        detail ? ` (${detail})` : ""
      }`,
    );
    // 403 from xAI = key rejected / no access to model or feature (not app CORS)
    throw new GrokApiError(
      response.status === 403
        ? "xAI rejected the API key or this model/feature (403)"
        : "AI query request failed",
      response.status,
    );
  }

  const content = getResponseText(data);

  if (!content) {
    console.error("AI returned no text content");
    throw new GrokApiError("AI returned an empty response", 502);
  }

  return { rawResponse: data, text: content };
}

function normalizeGrokChatOptions(
  options: GrokChatOptions,
): NormalizedGrokChatOptions {
  return {
    instructions: options.instructions ?? DEFAULT_INSTRUCTIONS,
    model: options.model ?? DEFAULT_GROK_MODEL,
    reasoningEffort: options.reasoningEffort ?? DEFAULT_REASONING_EFFORT,
    signal: options.signal,
    useCodeInterpreter: options.useCodeInterpreter ?? false,
  };
}

function buildGrokRequestPayload(
  input: GrokInputMessage[],
  options: NormalizedGrokChatOptions,
): GrokRequestPayload {
  return {
    model: options.model,
    temperature: 0.0,
    reasoning: {
      effort: options.reasoningEffort,
    },
    input: buildGrokInput(input, options.instructions),
    tools: buildGrokTools(options.useCodeInterpreter),
    text: {
      format: {
        type: "json_object",
      },
    },
  };
}

function buildGrokInput(
  input: GrokInputMessage[],
  instructions: string,
): GrokInputMessage[] {
  return [{ role: "system", content: instructions }, ...input];
}

function buildGrokTools(useCodeInterpreter: boolean): GrokTool[] {
  return [
    { type: "web_search" },
    ...(useCodeInterpreter ? [{ type: "code_interpreter" } as const] : []),
  ];
}

function getResponseText(data: GrokResponse) {
  if (data.output_text) {
    return data.output_text.trim();
  }

  const output = data.output ?? [];
  for (let index = output.length - 1; index >= 0; index -= 1) {
    const item = output[index];
    if (item.type !== "message") continue;

    const outputText = item.content?.find(
      (content) => content.type === "output_text",
    );
    if (outputText?.text) return outputText.text.trim();
  }

  return "";
}

function getGrokErrorDetail(data: GrokResponse) {
  if (typeof data.error === "string") return data.error;

  return [data.error?.code, data.error?.message].filter(Boolean).join(": ");
}

function logGrokRequestDebug(payload: GrokRequestPayload) {
  if (process.env.DEBUG_LOCALLY !== "true") return;

  console.log("xAI request payload shape", {
    model: payload.model,
    input: payload.input.map((message) => ({
      role: message.role,
      contentType: Array.isArray(message.content) ? "array" : "string",
      contentLength: Array.isArray(message.content)
        ? message.content.length
        : message.content.length,
    })),
    tools: payload.tools.map((tool) => tool.type),
    responseFormat: payload.text.format.type,
  });
}

function logGrokErrorDebug(data: GrokResponse) {
  if (process.env.DEBUG_LOCALLY !== "true") return;

  console.log("xAI error response body", data);
}
