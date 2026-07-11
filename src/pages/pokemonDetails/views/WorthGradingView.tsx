import type { GrokRequestState } from "../../../utils/grok/grokClient";

type WorthGradingViewProps = {
  grokRequest: GrokRequestState;
};

export function WorthGradingView({ grokRequest }: WorthGradingViewProps) {
  const { loading, error, response } = grokRequest;

  if (loading) return <p>Asking Grok...</p>;
  if (error) return <p className="card-view__page-error">{error}</p>;
  if (!response) return null;

  return <p>{response}</p>;
}
