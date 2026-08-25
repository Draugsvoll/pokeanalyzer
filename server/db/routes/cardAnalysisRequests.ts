import type { GrokChatOptions } from "../../services/xaiService.js";
import {
  collectorsAnalysisInput,
  collectorsAnalysisInstructions,
  priceAnalysisInput,
  priceAnalysisInstructions,
  sellMyCardInput,
  sellMyCardInstructions,
  worthGradingInput,
  worthGradingInstructions,
} from "../../../src/utils/grok/grokPrompts.js";
import { CreditHttpError } from "../../subscriptions/creditService.js";

type CardAnalysisContext = {
  cardName: string;
  cardNumber: string;
  cardPromptIdentity: string;
  setName: string;
};

type CardAnalysisGrokOptions = Pick<
  GrokChatOptions,
  "model" | "reasoningEffort" | "useCodeInterpreter"
>;

export type CardAnalysisFeature =
  "collector_analysis" | "price_analysis" | "sell_price" | "worth_grading";

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

const CARD_ANALYSIS_REQUESTS: Record<CardAnalysisFeature, CardAnalysisRequest> =
  {
    collector_analysis: {
      buildUserInput: (context) =>
        collectorsAnalysisInput(context.cardPromptIdentity),
      grokOptions: {
        model: "grok-4.5",
        reasoningEffort: "medium",
        useCodeInterpreter: true,
      },
      instructions: collectorsAnalysisInstructions,
    },
    price_analysis: {
      buildUserInput: (context) => {
        requireSetAndNumber(context);
        return priceAnalysisInput(
          context.cardName,
          context.setName,
          context.cardNumber,
        );
      },
      instructions: priceAnalysisInstructions,
    },
    sell_price: {
      buildUserInput: (context) => {
        requireSetAndNumber(context);
        return sellMyCardInput(
          context.cardName,
          context.setName,
          context.cardNumber,
        );
      },
      instructions: sellMyCardInstructions,
    },
    worth_grading: {
      buildUserInput: (context) =>
        worthGradingInput(context.cardPromptIdentity),
      grokOptions: {
        model: "grok-4.5",
        reasoningEffort: "low",
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
