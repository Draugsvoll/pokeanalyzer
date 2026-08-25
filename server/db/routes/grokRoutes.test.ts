import assert from "node:assert/strict";
import test from "node:test";
import { CreditHttpError } from "../../subscriptions/creditService.js";
import { requestAndSaveCardAnalysis } from "./grokRoutes.js";

const request = {
  cardId: "base1-58",
  feature: "collector_analysis",
  instructions: "Return the analysis.",
  signal: new AbortController().signal,
  storageKey: "collectors_analysis",
  userInput: "Pikachu 58/102 Base Set",
};

test("invalid card analysis is retried once and only the valid response is saved", async () => {
  const responses = ["invalid", "valid"];
  const savedInputs: unknown[] = [];
  let requestCount = 0;

  const result = await requestAndSaveCardAnalysis(request, {
    request: async () => responses[requestCount++],
    save: async (_cardId, _storageKey, response) => {
      savedInputs.push(response);
      return response === "valid"
        ? {
            analyses: [{ variant_name: "Unlimited" }],
            timestamp: "2026-08-25T00:00:00.000Z",
          }
        : null;
    },
  });

  assert.equal(requestCount, 2);
  assert.deepEqual(savedInputs, ["invalid", "valid"]);
  assert.deepEqual(result, {
    analyses: [{ variant_name: "Unlimited" }],
    timestamp: "2026-08-25T00:00:00.000Z",
  });
});

test("two invalid card analyses stop after two attempts and return 502", async () => {
  let requestCount = 0;
  let saveCount = 0;

  await assert.rejects(
    requestAndSaveCardAnalysis(request, {
      request: async () => {
        requestCount += 1;
        return "invalid";
      },
      save: async () => {
        saveCount += 1;
        return null;
      },
    }),
    (error: unknown) =>
      error instanceof CreditHttpError && error.statusCode === 502,
  );

  assert.equal(requestCount, 2);
  assert.equal(saveCount, 2);
});
