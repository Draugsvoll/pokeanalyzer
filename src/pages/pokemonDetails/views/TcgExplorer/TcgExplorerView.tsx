import { useDualViewAvailable } from "../../../../components/marketplaceListings/useDualViewAvailable";
import type {
  MarketplaceSide,
  MarketplaceStatus,
} from "../../../../../shared/marketplaceSearch";
import { getTcgRowPrice, getTcgPriceSummary } from "./tcgPrices";
import { useId, useState } from "react";
import { ExternalLink, BadgeCheck, PackageCheck } from "lucide-react";
import {
  MarketplaceListings,
  MarketplaceResultPanel,
} from "../../../../components/marketplaceListings/MarketplaceListings";
import {
  MarketplaceResultRow,
  type MarketplaceMetadataItem,
} from "../../../../components/marketplaceListings/MarketplaceResultRow";
import {
  TCG_CONDITIONS,
  normalizeTcgLabel,
  type TcgCondition,
  type TcgSnapshot,
  type TcgSale,
} from "../../../../../shared/tcgExplorer";

type Sort = "price-desc" | "price-asc" | "date-desc" | "date-asc";
const RESULTS_BATCH_SIZE = 15;
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
function saleDate(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Date unavailable";
}
export function TcgExplorerView({
  data,
  initialSide = "sold",
  listingStates,
}: {
  data: TcgSnapshot;
  initialSide?: MarketplaceSide;
  listingStates?: Record<MarketplaceSide, MarketplaceStatus>;
}) {
  const conditionId = useId();
  const [condition, setCondition] = useState<TcgCondition>("all");
  const [expansion, setExpansion] = useState({ expanded: false });
  const [mode, setMode] = useState<"single" | "dual">("single");
  const dualAvailable = useDualViewAvailable();
  const dual = dualAvailable && mode === "dual";
  const [side, setSide] = useState<"sales" | "offers">(
    initialSide === "sold" ? "sales" : "offers",
  );
  const [sort, setSort] = useState<Sort>("price-desc");
  const [visibleResultCounts, setVisibleResultCounts] = useState({
    sales: RESULTS_BATCH_SIZE,
    offers: RESULTS_BATCH_SIZE,
  });
  function resetVisibleResults() {
    setVisibleResultCounts({
      sales: RESULTS_BATCH_SIZE,
      offers: RESULTS_BATCH_SIZE,
    });
  }
  const displayedSort =
    !dual && side === "offers" && sort.startsWith("date") ? "price-desc" : sort;
  const productUrl = `https://www.tcgplayer.com/product/${data.productId}`;
  const conditionCounts = new Map<string, number>();
  for (const row of [...(data.sales ?? []), ...(data.offers ?? [])]) {
    if (row.condition === null) continue;
    const key = normalizeTcgLabel(row.condition);
    conditionCounts.set(key, (conditionCounts.get(key) ?? 0) + 1);
  }
  const availableConditions = TCG_CONDITIONS.filter(
    (item) =>
      item.value === "all" ||
      (conditionCounts.get(normalizeTcgLabel(item.name)) ?? 0) > 0,
  );

  function renderPanel(panel: "sales" | "offers") {
    const rows = data[panel];
    const loading =
      listingStates?.[panel === "sales" ? "sold" : "active"] === "pending";
    const sorted = (rows ?? [])
      // Keep each snapshot row identified by its original position as the view changes.
      .map((row, index) => ({ row, key: `${panel}-${index}` }))
      .filter(
        ({ row }) =>
          condition === "all" ||
          (row.condition !== null &&
            normalizeTcgLabel(row.condition) ===
              normalizeTcgLabel(
                TCG_CONDITIONS.find((item) => item.value === condition)!.name,
              )),
      )
      .sort(({ row: a }, { row: b }) => {
        if (panel === "sales" && sort.startsWith("date")) {
          const first = (a as TcgSale).soldDate;
          const second = (b as TcgSale).soldDate;
          if (!first || !second) return first ? -1 : second ? 1 : 0;
          return (
            (Date.parse(first) - Date.parse(second)) *
            (sort === "date-asc" ? 1 : -1)
          );
        }
        return (
          (getTcgRowPrice(a, false) - getTcgRowPrice(b, false)) *
          (sort === "price-asc" ? 1 : -1)
        );
      });
    const summary = getTcgPriceSummary(
      sorted.map(({ row }) => row),
      false,
    );
    const state =
      rows === null ? (
        <p role="status">
          We couldn't load {panel === "sales" ? "sales" : "offers"}. You can
          start a new search to try again.
        </p>
      ) : panel === "offers" && !data.offersMatched ? (
        <p>No exact product match was returned by the offer search.</p>
      ) : !sorted.length ? (
        <p>
          No matching TCG {panel === "sales" ? "sales" : "listings"} found.
        </p>
      ) : null;
    return (
      <MarketplaceResultPanel
        key={panel}
        scrollResetKey={`${condition}-${sort}`}
        onScroll={(event) => {
          const element = event.currentTarget;
          if (
            element.scrollHeight - element.scrollTop - element.clientHeight <
              96 &&
            visibleResultCounts[panel] < sorted.length
          ) {
            setVisibleResultCounts((counts) => ({
              ...counts,
              [panel]: Math.min(
                counts[panel] + RESULTS_BATCH_SIZE,
                sorted.length,
              ),
            }));
          }
        }}
        label={panel === "sales" ? "Sold" : "Listed"}
        headingAction={
          panel === "offers" ? (
            <a
              className="app-link marketplace-listings__product-link"
              href={productUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on TCG <ExternalLink size={14} aria-hidden="true" />
            </a>
          ) : undefined
        }
        ariaLabel={
          panel === "sales"
            ? "TCGplayer recent sales"
            : "TCGplayer available offers"
        }
        count={
          rows === null
            ? undefined
            : `${sorted.length} ${sorted.length === 1 ? "result" : "results"}`
        }
        summary={
          summary
            ? {
                high: money.format(summary.high),
                median: money.format(summary.median),
                low: money.format(summary.low),
              }
            : null
        }
        dual={dual}
        loading={loading}
        loadingLabel={`Loading ${panel === "sales" ? "sold" : "listed"} TCG results`}
        state={
          state && <div className="marketplace-listings__state">{state}</div>
        }
      >
        {sorted.slice(0, visibleResultCounts[panel]).map(({ row, key }) => {
          const offer = "sellerName" in row ? row : null;
          const metadataItems: MarketplaceMetadataItem[] = [
            row.condition,
            "variant" in row ? row.variant : row.printing,
          ]
            .filter((label): label is string => Boolean(label))
            .map((label) => ({ label }));
          if (row.quantity !== null && row.quantity !== 1)
            metadataItems.push({
              label: `${row.quantity} ${offer ? "available" : "in transaction"}`,
            });
          metadataItems.push({
            label:
              row.shippingPrice === 0
                ? "Free shipping"
                : `${money.format(row.shippingPrice)} shipping`,
          });
          if (offer?.sellerRating != null)
            metadataItems.push({ label: `${offer.sellerRating}% feedback` });
          if (offer?.sellerSales != null)
            metadataItems.push({
              label: `${offer.sellerSales.toLocaleString()} seller sales`,
            });
          if (offer?.sellerLocation)
            metadataItems.push({ label: offer.sellerLocation });
          if (offer?.goldSeller) metadataItems.push({ label: "Gold seller" });
          if (offer?.verifiedSeller)
            metadataItems.push({
              label: "Verified",
              icon: <BadgeCheck size={14} aria-hidden="true" />,
            });
          if (offer?.directSeller)
            metadataItems.push({
              label: "Direct",
              icon: <PackageCheck size={14} aria-hidden="true" />,
            });
          return (
            <MarketplaceResultRow
              key={key}
              title={
                offer
                  ? (offer.sellerName ?? "Seller unavailable")
                  : saleDate((row as TcgSale).soldDate)
              }
              metadataItems={metadataItems}
              price={money.format(getTcgRowPrice(row, false))}
              expansion={expansion}
            />
          );
        })}
      </MarketplaceResultPanel>
    );
  }
  return (
    <MarketplaceListings
      source="TCG"
      sideStates={listingStates}
      filters={
        <div className="marketplace-listings__grade-controls">
          <fieldset className="marketplace-listings__filters radio-group">
            <legend className="marketplace-listings__condition-legend">
              Condition
            </legend>
            <div>
              {availableConditions.map((item) => (
                <label key={item.value}>
                  <input
                    type="radio"
                    name={conditionId}
                    value={item.value}
                    checked={condition === item.value}
                    onChange={() => {
                      setCondition(item.value);
                      resetVisibleResults();
                    }}
                    aria-label={item.name}
                  />
                  <span>
                    {item.value === "all" ? "All" : item.label}
                    {item.value !== "all" && (
                      <small className="ui-select-dropdown__count">
                        (
                        {conditionCounts.get(normalizeTcgLabel(item.name)) ?? 0}
                        )
                      </small>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      }
      side={side === "sales" ? "sold" : "active"}
      onSideChange={(value) => setSide(value === "sold" ? "sales" : "offers")}
      sort={displayedSort}
      onSortChange={(value) => {
        setSort(value);
        resetVisibleResults();
      }}
      dual={dual}
      dualAvailable={dualAvailable}
      onDualChange={(value) => setMode(value ? "dual" : "single")}
      datesAvailable={dual || side === "sales"}
      expansion={expansion}
      onExpandChange={(expanded) => setExpansion({ expanded })}
      renderPanel={(value) =>
        renderPanel(value === "sold" ? "sales" : "offers")
      }
    />
  );
}
