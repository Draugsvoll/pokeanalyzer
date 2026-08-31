import assert from "node:assert/strict";
import test from "node:test";
import {
  collectorsAnalysisInstructions,
  priceAnalysisInstructions,
  sellMyCardInstructions,
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
  const price = getCardAnalysisRequest("price_analysis")!;
  const sell = getCardAnalysisRequest("sell_price")!;
  const worthGrading = getCardAnalysisRequest("worth_grading")!;

  assert.equal(collector.instructions, collectorsAnalysisInstructions);
  assert.deepEqual(collector.grokOptions, {
    model: "grok-4.5",
    reasoningEffort: "medium",
    useCodeInterpreter: true,
  });

  assert.equal(price.instructions, priceAnalysisInstructions);
  assert.equal(price.grokOptions, undefined);

  assert.equal(sell.instructions, sellMyCardInstructions);
  assert.equal(sell.grokOptions, undefined);

  assert.equal(worthGrading.instructions, worthGradingInstructions);
  assert.deepEqual(worthGrading.grokOptions, {
    model: "grok-4.5",
    reasoningEffort: "low",
    useCodeInterpreter: true,
  });
});

test("card features build their user input from the stored card context", () => {
  const collectorInput =
    getCardAnalysisRequest("collector_analysis")!.buildUserInput(cardContext);
  const priceInput =
    getCardAnalysisRequest("price_analysis")!.buildUserInput(cardContext);
  const sellInput =
    getCardAnalysisRequest("sell_price")!.buildUserInput(cardContext);
  const worthGradingInput =
    getCardAnalysisRequest("worth_grading")!.buildUserInput(cardContext);

  assert.match(collectorInput, /Pikachu 58\/102 Base Set/);
  assert.match(priceInput, /Pikachu/);
  assert.match(priceInput, /Base Set/);
  assert.match(priceInput, /58\/102/);
  assert.match(sellInput, /Pikachu/);
  assert.match(sellInput, /Base Set/);
  assert.match(sellInput, /58\/102/);
  assert.match(worthGradingInput, /Pikachu 58\/102 Base Set/);
});

test("unknown card features do not resolve to a request", () => {
  assert.equal(getCardAnalysisRequest("market_news"), undefined);
});
