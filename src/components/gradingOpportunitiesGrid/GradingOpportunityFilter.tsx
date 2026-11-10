import "./GradingOpportunityFilter.scss";

export function GradingOpportunityFilter({
  checked,
  count,
  onChange,
}: {
  checked: boolean;
  count: number;
  onChange: (checked: boolean) => void;
}) {
  if (count === 0) return null;

  return (
    <label className="grading-opportunity-filter">
      <input
        type="checkbox"
        className="app-checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        {count.toLocaleString("en-US")} grading{" "}
        {count === 1 ? "opportunity" : "opportunities"}
      </span>
    </label>
  );
}
