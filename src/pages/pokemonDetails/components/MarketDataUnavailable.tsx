import "./MarketDataUnavailable.scss";

type MarketDataUnavailableProps = {
  className?: string;
  description: string;
  title: string;
};

export function MarketDataUnavailable({
  className = "",
  description,
  title,
}: MarketDataUnavailableProps) {
  return (
    <div
      className={`market-data-unavailable ui-render-fade ${className}`.trim()}
      role="status"
    >
      <div className="market-data-unavailable__copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
    </div>
  );
}
