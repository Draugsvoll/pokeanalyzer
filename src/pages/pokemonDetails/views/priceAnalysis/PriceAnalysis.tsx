import { LoadingState } from "../../../../components/loadingState/LoadingState";
import type { PokemonCard } from "../../../../types/pokemon";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
import { FEATURE_ERROR_MESSAGE } from "../featureError";
import { MarketAnalysisView } from "../MarketAnalysis/MarketAnalysisView";
import { JustTcgVariants } from "./JustTcgVariants/JustTcgVariants";
import { StoredPrices } from "./StoredPrices";
import "./PriceAnalysis.scss";

type PriceAnalysisProps = {
  card: PokemonCard;
  grokRequest: GrokRequestState;
  justTcgRequest: {
    loading: boolean;
    error: string;
    response: unknown;
  };
  reportLoading?: boolean;
  reportAvailable?: boolean;
};

function JustTcgPriceAnalysis({
  card,
  justTcgRequest,
}: Pick<PriceAnalysisProps, "card" | "justTcgRequest">) {
  if (justTcgRequest.loading) {
    return <LoadingState>Fetching price history...</LoadingState>;
  }

  if (justTcgRequest.error) {
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  }

  if (justTcgRequest.response === null) return null;

  return (
    <JustTcgVariants cardName={card.name} response={justTcgRequest.response} />
  );
}

export function PriceAnalysis({
  card,
  grokRequest,
  justTcgRequest,
  reportLoading = false,
  reportAvailable = false,
}: PriceAnalysisProps) {
  return (
    <div className="price-analysis-view ui-render-fade">
      <StoredPrices
        card={card}
        reportLoading={reportLoading}
        reportAvailable={reportAvailable}
      />
      <JustTcgPriceAnalysis card={card} justTcgRequest={justTcgRequest} />
      <MarketAnalysisView grokRequest={grokRequest} />
    </div>
  );
}
