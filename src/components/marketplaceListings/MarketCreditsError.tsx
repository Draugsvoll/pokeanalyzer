import "./MarketCreditsError.scss";

type Props = {
  message: string;
  onRetry: () => void;
};

export function MarketCreditsError({ message, onRetry }: Props) {
  return (
    <div className="market-credits-error" role="alert">
      <span>{message}</span>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
