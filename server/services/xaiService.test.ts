import assert from "node:assert/strict";
import test from "node:test";
import { chat } from "./xaiService.js";

type CapturedRequest = {
  headers: Record<string, string>;
  payload: Record<string, unknown>;
  url: string;
};

function mockSuccessfulXaiRequest(t: test.TestContext) {
  const requests: CapturedRequest[] = [];
  const previousApiKey = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = "test-api-key";

  t.after(() => {
    if (previousApiKey === undefined) {
      delete process.env.XAI_API_KEY;
    } else {
      process.env.XAI_API_KEY = previousApiKey;
    }
  });

  t.mock.method(
    globalThis,
    "fetch",
    async (...args: Parameters<typeof fetch>) => {
      const [input, init] = args;
      requests.push({
        headers: init?.headers as Record<string, string>,
        payload: JSON.parse(String(init?.body)) as Record<string, unknown>,
        url: String(input),
      });

      return new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: '{"ok":true}' }],
            },
          ],
        }),
        { status: 200 },
      );
    },
  );

  return requests;
}

test("chat sends the documented xAI payload with app defaults", async (t) => {
  const requests = mockSuccessfulXaiRequest(t);

  const result = await chat("card details");

  assert.equal(result, '{"ok":true}');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.x.ai/v1/responses");
  assert.equal(requests[0].headers.Authorization, "Bearer test-api-key");
  assert.deepEqual(requests[0].payload, {
    model: "grok-4.3",
    temperature: 0,
    reasoning: { effort: "medium" },
    input: [
      { role: "system", content: "Answer clearly" },
      { role: "user", content: "card details" },
    ],
    tools: [{ type: "web_search" }],
    text: { format: { type: "json_object" } },
  });
});

test("chat applies custom instructions, model, reasoning, and interpreter", async (t) => {
  const requests = mockSuccessfulXaiRequest(t);

  await chat("Pikachu 58/102 Base Set", {
    instructions: "Return the grading analysis JSON object.",
    model: "grok-4.5",
    reasoningEffort: "low",
    useCodeInterpreter: true,
  });

  assert.deepEqual(requests[0].payload, {
    model: "grok-4.5",
    temperature: 0,
    reasoning: { effort: "low" },
    input: [
      {
        role: "system",
        content: "Return the grading analysis JSON object.",
      },
      { role: "user", content: "Pikachu 58/102 Base Set" },
    ],
    tools: [{ type: "web_search" }, { type: "code_interpreter" }],
    text: { format: { type: "json_object" } },
  });
});

test("chat makes only one xAI attempt when the request fails", async (t) => {
  const previousApiKey = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = "test-api-key";
  let requestCount = 0;

  t.after(() => {
    if (previousApiKey === undefined) {
      delete process.env.XAI_API_KEY;
    } else {
      process.env.XAI_API_KEY = previousApiKey;
    }
  });
  t.mock.method(console, "error", () => undefined);
  t.mock.method(globalThis, "fetch", async () => {
    requestCount += 1;
    return new Response(JSON.stringify({ error: "temporary failure" }), {
      status: 500,
    });
  });

  await assert.rejects(() => chat("card details"), {
    name: "GrokApiError",
    statusCode: 500,
  });
  assert.equal(requestCount, 1);
});
