import { useId } from "react";
import { FilterInput } from "../filterInput/FilterInput";
import { InfoTooltip } from "../ui/InfoTooltip";
export type MarketplaceKeywordFiltersProps = {
  include: string;
  exclude: string;
  onIncludeChange: (value: string) => void;
  onExcludeChange: (value: string) => void;
};
export function MarketplaceKeywordFilters(
  props: MarketplaceKeywordFiltersProps,
) {
  const id = useId();
  return (
    <div className="marketplace-listings__control-group">
      {(["exclude", "include"] as const).map((kind) => {
        const include = kind === "include";
        const label = include ? "Include" : "Exclude";
        return (
          <div className="marketplace-listings__keyword-filter" key={kind}>
            <FilterInput
              ariaLabel={`${label} keywords`}
              className="marketplace-listings__text-filter"
              clearLabel={`Clear ${include ? "included" : "excluded"} keywords`}
              id={`${id}-${kind}`}
              onChange={include ? props.onIncludeChange : props.onExcludeChange}
              placeholder={`${label} keywords`}
              value={props[kind]}
            />
            {!props[kind].trim() && (
              <InfoTooltip
                className="marketplace-listings__filter-help"
                label={`How ${include ? "included" : "excluded"} keywords work`}
              >
                <strong>Keywords</strong>
                <span>
                  {include
                    ? "Separate keywords with commas. Results must match all words."
                    : "Separate keywords with commas. Results are excluded if they match any keyword."}
                </span>
              </InfoTooltip>
            )}
          </div>
        );
      })}
    </div>
  );
}
