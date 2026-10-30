import {
  useId,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type UIEventHandler,
} from "react";
import { ChevronDown, Columns2, Rows2 } from "lucide-react";
import { SegmentedRadioGroup } from "../ui/SegmentedRadioGroup";
import { RadioButtonGroup } from "../radioButtonGroup/RadioButtonGroup";
import "./MarketplaceListings.scss";
import {
  MarketplaceKeywordFilters,
  type MarketplaceKeywordFiltersProps,
} from "./MarketplaceKeywordFilters";

type Side = "sold" | "active";
type Sort = "price-desc" | "price-asc" | "date-desc" | "date-asc";
type SideState = "pending" | "success" | "error";
type Props = {
  source: "Ebay" | "TCG";
  side: Side;
  onSideChange: (side: Side) => void;
  sort: Sort;
  onSortChange: (sort: Sort) => void;
  dual: boolean;
  onDualChange: (dual: boolean) => void;
  dualAvailable?: boolean;
  datesAvailable?: boolean;
  sideStates?: Record<Side, SideState>;
  filters?: ReactNode;
  keywordFilters?: MarketplaceKeywordFiltersProps;
  clearFilters?: ReactNode;
  expansion: { expanded: boolean };
  onExpandChange: (expanded: boolean) => void;
  busy?: boolean;
  showResults?: boolean;
  children?: ReactNode;
  renderPanel: (side: Side) => ReactNode;
  footer?: ReactNode;
};

/** Shared presentation; providers own retrieval, filtering, and price semantics. */
export function MarketplaceListings({
  source,
  side,
  onSideChange,
  sort,
  onSortChange,
  dual,
  onDualChange,
  dualAvailable = true,
  datesAvailable = true,
  sideStates,
  filters,
  keywordFilters,
  clearFilters,
  expansion,
  onExpandChange,
  busy = false,
  showResults = true,
  children,
  renderPanel,
  footer,
}: Props) {
  const id = useId();
  return (
    <div
      className="marketplace-listings ui-render-fade"
      style={
        {
          "--marketplace-accent":
            source === "Ebay" ? "var(--teal)" : "var(--orange)",
        } as CSSProperties
      }
    >
      {!dual && (
        <span className="feature-analysis-eyebrow marketplace-listings__eyebrow">
          Sold &amp; active listings
        </span>
      )}
      <div className="marketplace-listings__surface">
        {!dual && (
          <div className="marketplace-listings__listing-selector">
            <SegmentedRadioGroup
              ariaLabel={`${source} listing type`}
              className="marketplace-listings__listing-toggle"
              name={`${id}-listing-type`}
              value={side}
              onChange={onSideChange}
              options={[
                {
                  value: "sold",
                  label: "Sold",
                  loading: sideStates?.sold === "pending",
                  disabled: sideStates && sideStates.sold !== "success",
                },
                {
                  value: "active",
                  label: "Listed",
                  loading: sideStates?.active === "pending",
                  disabled: sideStates && sideStates.active !== "success",
                },
              ]}
            />
          </div>
        )}
        <div className="marketplace-listings__filter-row">
          {filters}
          <div className="marketplace-listings__view-controls">
            {clearFilters}
            <div className="marketplace-listings__sorting">
              <RadioButtonGroup
                ariaLabel={`Sort ${source} listings`}
                value={sort}
                onChange={onSortChange}
                options={[
                  { value: "price-desc", label: "Price ↓" },
                  { value: "price-asc", label: "Price ↑" },
                  {
                    value: "date-desc",
                    label: "Newest",
                    disabled: !datesAvailable,
                  },
                  {
                    value: "date-asc",
                    label: "Oldest",
                    disabled: !datesAvailable,
                  },
                ]}
              />
            </div>
            {dualAvailable && (
              <div className="marketplace-listings__view-toggle-anchor">
                <RadioButtonGroup
                  ariaLabel={`${source} results view`}
                  className="marketplace-listings__view-toggle"
                  value={dual ? "dual" : "single"}
                  onChange={(value) => onDualChange(value === "dual")}
                  options={[
                    {
                      value: "single",
                      label: (
                        <>
                          <Rows2 aria-hidden="true" />
                          Single
                        </>
                      ),
                    },
                    {
                      value: "dual",
                      label: (
                        <>
                          <Columns2 aria-hidden="true" />
                          Dual
                        </>
                      ),
                    },
                  ]}
                />
                {dual && (
                  <button
                    type="button"
                    className="marketplace-listings__expand-all"
                    aria-label={`${expansion.expanded ? "Collapse" : "Expand"} all listings`}
                    title={`${expansion.expanded ? "Collapse" : "Expand"} all listings`}
                    aria-expanded={expansion.expanded}
                    onClick={() => onExpandChange(!expansion.expanded)}
                  >
                    <span>
                      {expansion.expanded ? "Collapse all" : "Expand all"}
                    </span>
                    <ChevronDown aria-hidden="true" size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {keywordFilters && (
          <div className="marketplace-listings__filter-row">
            <MarketplaceKeywordFilters {...keywordFilters} />
          </div>
        )}
      </div>
      {children}
      {showResults && (
        <div className="marketplace-listings__results-region" aria-busy={busy}>
          <div
            className={`marketplace-listings__result-panels${dual ? " marketplace-listings__result-panels--advanced" : ""}`}
          >
            {dual ? (
              <>
                {renderPanel("sold")}
                {renderPanel("active")}
              </>
            ) : (
              renderPanel(side)
            )}
          </div>
        </div>
      )}
      {footer}
    </div>
  );
}

type PanelProps = {
  label: string;
  ariaLabel: string;
  count?: string;
  summary: { high: string; median: string; low: string } | null;
  dual: boolean;
  loading?: boolean;
  busy?: boolean;
  loadingLabel?: string;
  description?: ReactNode;
  state?: ReactNode;
  footer?: ReactNode;
  resultsKey?: string;
  scrollResetKey?: string;
  onScroll?: UIEventHandler<HTMLDivElement>;
  children: ReactNode;
};
export function MarketplaceResultPanel({
  label,
  ariaLabel,
  count,
  summary,
  dual,
  loading = false,
  busy,
  loadingLabel,
  description,
  state,
  footer,
  resultsKey,
  scrollResetKey,
  onScroll,
  children,
}: PanelProps) {
  const resultsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (scrollResetKey !== undefined && resultsRef.current) {
      resultsRef.current.scrollTop = 0;
    }
  }, [scrollResetKey]);

  return (
    <section
      className={`marketplace-listings__result-panel${dual ? "" : " marketplace-listings__result-panel--basic"}${loading ? " marketplace-listings__result-panel--loading" : ""}`}
      aria-label={ariaLabel}
    >
      <header className="marketplace-listings__result-summary">
        <h2>
          <span
            role={!dual && !loading ? "status" : undefined}
            aria-busy={!dual && !loading ? busy : undefined}
          >
            <span className="marketplace-listings__summary-label">{label}</span>
            {!loading && count !== undefined && (
              <>
                {" "}
                ·{" "}
                <span
                  className="marketplace-listings__result-count ui-render-fade"
                  key={count}
                >
                  {count}
                </span>
              </>
            )}
          </span>
        </h2>
        {!loading && summary && (
          <dl
            aria-label={`${label} price summary`}
            className="marketplace-listings__price-summary"
          >
            {(["high", "median", "low"] as const).map((metric) => (
              <div key={metric}>
                <dt>
                  {metric === "high"
                    ? "High"
                    : metric === "median"
                      ? "Median"
                      : "Low"}
                </dt>
                <dd className="ui-render-fade" key={summary[metric]}>
                  {summary[metric]}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {description}
      </header>
      {loading ? (
        <div
          aria-label={loadingLabel}
          className="marketplace-listings__state marketplace-listings__state--loading"
          role="status"
        >
          <span aria-hidden="true" className="app-loading-spinner" />
        </div>
      ) : (
        state
      )}
      <div
        className="marketplace-listings__results"
        key={resultsKey}
        ref={resultsRef}
        onScroll={onScroll}
      >
        {children}
      </div>
      {footer && <div className="marketplace-listings__footer">{footer}</div>}
    </section>
  );
}
