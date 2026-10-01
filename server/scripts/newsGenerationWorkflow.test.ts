import assert from "node:assert/strict";
import test from "node:test";
import { runNewsGenerationWorkflow } from "./newsGenerationWorkflow.js";

test("market summary still generates and saves when market news fails", async () => {
  const calls: string[] = [];
  const newsError = new Error("Market news failed");
  const summaryPayload = { headline: "Markets were mixed" };

  const failures = await runNewsGenerationWorkflow(
    {
      name: "latest news",
      generate: async () => {
        calls.push("generate latest news");
        return { ok: false, error: newsError };
      },
      save: async () => {
        assert.fail("Failed market news must not be saved");
      },
    },
    {
      name: "market summary",
      generate: async () => {
        calls.push("generate market summary");
        return { ok: true, payload: summaryPayload };
      },
      save: async (payload) => {
        assert.equal(payload, summaryPayload);
        calls.push("save market summary");
        return null;
      },
    },
  );

  assert.deepEqual(calls, [
    "generate latest news",
    "generate market summary",
    "save market summary",
  ]);
  assert.deepEqual(failures, [{ name: "latest news", error: newsError }]);
});

test("market news still generates and saves when market summary fails", async () => {
  const calls: string[] = [];
  const summaryError = new Error("Market summary failed");
  const newsPayload = { headline: "A new set was announced" };

  const failures = await runNewsGenerationWorkflow(
    {
      name: "latest news",
      generate: async () => {
        calls.push("generate latest news");
        return { ok: true, payload: newsPayload };
      },
      save: async (payload) => {
        assert.equal(payload, newsPayload);
        calls.push("save latest news");
        return null;
      },
    },
    {
      name: "market summary",
      generate: async () => {
        calls.push("generate market summary");
        return { ok: false, error: summaryError };
      },
      save: async () => {
        assert.fail("Failed market summary must not be saved");
      },
    },
  );

  assert.deepEqual(calls, [
    "generate latest news",
    "save latest news",
    "generate market summary",
  ]);
  assert.deepEqual(failures, [{ name: "market summary", error: summaryError }]);
});

test("saved market news remains successful when saving market summary fails", async () => {
  const calls: string[] = [];
  const summarySaveError = new Error("Market summary save failed");
  const newsPayload = { headline: "A new set was announced" };
  const summaryPayload = { headline: "Markets were mixed" };

  const failures = await runNewsGenerationWorkflow(
    {
      name: "latest news",
      generate: async () => {
        calls.push("generate latest news");
        return { ok: true, payload: newsPayload };
      },
      save: async (payload) => {
        assert.equal(payload, newsPayload);
        calls.push("save latest news");
        return null;
      },
    },
    {
      name: "market summary",
      generate: async () => {
        calls.push("generate market summary");
        return { ok: true, payload: summaryPayload };
      },
      save: async (payload) => {
        assert.equal(payload, summaryPayload);
        calls.push("save market summary");
        return summarySaveError;
      },
    },
  );

  assert.deepEqual(calls, [
    "generate latest news",
    "save latest news",
    "generate market summary",
    "save market summary",
  ]);
  assert.deepEqual(failures, [
    { name: "market summary", error: summarySaveError },
  ]);
});
