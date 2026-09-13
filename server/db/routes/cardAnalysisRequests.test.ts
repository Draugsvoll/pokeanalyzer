import assert from "node:assert/strict";
import test from "node:test";
import {
  collectorsAnalysisInstructions,
  marketAnalysisInstructions,
  worthGradingInstructions,
} from "../../../src/utils/grok/grokPrompts.js";
import { getCardAnalysisRequest } from "./cardAnalysisRequests.js";

const cardContext = {
  cardName: "Pikachu",
  cardNumber: "58/102",
  cardPromptIdentity: "Pikachu 58/102 Base Set",
  setName: "Base Set",
};

test("card features use the expected instructions and Grok options", () => {
  const collector = getCardAnalysisRequest("collector_analysis")!;
  const market = getCardAnalysisRequest("market_analysis")!;
  const worthGrading = getCardAnalysisRequest("worth_grading")!;

  assert.equal(collector.instructions, collectorsAnalysisInstructions);
  assert.deepEqual(collector.grokOptions, {
    model: "grok-4.5",
    reasoningEffort: "medium",
  });

  assert.equal(market.instructions, marketAnalysisInstructions);
  assert.deepEqual(market.grokOptions, {
    model: "grok-4.5",
    reasoningEffort: "medium",
  });

  assert.equal(worthGrading.instructions, worthGradingInstructions);
  assert.deepEqual(worthGrading.grokOptions, {
    model: "grok-4.5",
    reasoningEffort: "high",
    useCodeInterpreter: true,
  });
});

test("card features build their user input from the stored card context", () => {
  const collectorInput =
    getCardAnalysisRequest("collector_analysis")!.buildUserInput(cardContext);
  const marketInput =
    getCardAnalysisRequest("market_analysis")!.buildUserInput(cardContext);
  const worthGradingInput =
    getCardAnalysisRequest("worth_grading")!.buildUserInput(cardContext);

  assert.match(collectorInput, /Pikachu 58\/102 Base Set/);
  assert.equal(marketInput, "Name: Pikachu set: Base Set number:58");
  assert.match(worthGradingInput, /Pikachu 58\/102 Base Set/);
});

test("unknown card features do not resolve to a request", () => {
  assert.equal(getCardAnalysisRequest("market_news"), undefined);
});
