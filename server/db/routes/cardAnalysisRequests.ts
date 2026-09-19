import type { GrokChatOptions } from "../../services/xaiService.js";
import {
  collectorsAnalysisInstructions,
  marketAnalysisInstructions,
  worthGradingInstructions,
} from "../../../src/utils/grok/grokPrompts.js";
import { normalizeCardVariant } from "../../../shared/normalizeCardVariant.js";
import { CreditHttpError } from "../../subscriptions/creditService.js";

type CardAnalysisContext = {
  cardName: string;
  cardNumber: string;
  setName: string;
  variantName: string;
};

type CardAnalysisGrokOptions = Pick<
  GrokChatOptions,
  "model" | "reasoningEffort" | "useCodeInterpreter"
>;

export type CardAnalysisFeature =
  "collector_analysis" | "market_analysis" | "worth_grading";

export type CardAnalysisRequest = {
  buildUserInput: (context: CardAnalysisContext) => string;
  grokOptions?: CardAnalysisGrokOptions;
  instructions: string;
};

function requireSetAndNumber(
  context: CardAnalysisContext,
): asserts context is CardAnalysisContext & {
  cardNumber: string;
  setName: string;
} {
  if (!context.setName || !context.cardNumber) {
    throw new CreditHttpError("Card is missing set or number data", 422);
  }
}

function cardIdentityInput(context: CardAnalysisContext) {
  requireSetAndNumber(context);
  return JSON.stringify({
    name: context.cardName,
    cardNumber: context.cardNumber,
    set: context.setName,
  });
}

function worthGradingCardInput(context: CardAnalysisContext) {
  requireSetAndNumber(context);
  return JSON.stringify({
    name: context.cardName,
    cardNumber: context.cardNumber,
    set: context.setName,
    variant: normalizeCardVariant(context.variantName) || "normal",
  });
}

const CARD_ANALYSIS_REQUESTS: Record<CardAnalysisFeature, CardAnalysisRequest> =
  {
    collector_analysis: {
      buildUserInput: cardIdentityInput,
      grokOptions: {
        model: "grok-4.5",
        reasoningEffort: "medium",
      },
      instructions: collectorsAnalysisInstructions,
    },
    market_analysis: {
      buildUserInput: cardIdentityInput,
      grokOptions: {
        model: "grok-4.5",
        reasoningEffort: "medium",
      },
      instructions: marketAnalysisInstructions,
    },
    worth_grading: {
      buildUserInput: worthGradingCardInput,
      grokOptions: {
        model: "grok-4.5",
        reasoningEffort: "high",
        useCodeInterpreter: true,
      },
      instructions: worthGradingInstructions,
    },
  };

export function getCardAnalysisRequest(feature: string) {
  return feature in CARD_ANALYSIS_REQUESTS
    ? CARD_ANALYSIS_REQUESTS[feature as CardAnalysisFeature]
    : undefined;
}
