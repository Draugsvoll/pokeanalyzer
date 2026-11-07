import { Badge } from "../ui/Badge";
import "./GradingOpportunitiesGrid.scss";

export function GradingOpportunityBadge({
  multiplier,
}: {
  multiplier: number;
}) {
  const label = multiplier.toLocaleString("en-US", {
    minimumFractionDigits: multiplier < 10 ? 1 : 0,
    maximumFractionDigits: multiplier < 10 ? 1 : 0,
  });
  return (
    <div className="grading-opportunity__multiplier">
      <Badge
        accent="blue"
        size="sm"
        weight="strong"
        title="TCG Near Mint price -> eBay PSA 10 median (30-day)  "
        aria-label={`${label} times TCGPlayer Near Mint price, based on eBay PSA 10 30-day median`}
      >
        {label}×
      </Badge>
    </div>
  );
}
