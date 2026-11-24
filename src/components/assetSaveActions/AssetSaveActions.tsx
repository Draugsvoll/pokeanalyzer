import { Heart, Star, type LucideIcon } from "lucide-react";
import Button from "../button/Button";
import { useAuth } from "../../context/authContextValue";
import { useWatchlistCache } from "../../context/watchlistCacheContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import { useWatchlist } from "../../hooks/useWatchlist";
import type { WatchlistItem } from "../../types/watchlist";
import "./AssetSaveActions.scss";

type ActionState = {
  saved: boolean;
  busy: boolean;
  unavailable: boolean;
  onToggle: () => void | Promise<void>;
};

function SaveButton({
  saved,
  busy,
  unavailable,
  onToggle,
  icon: Icon,
  label,
  layout,
  hoverOnly,
}: ActionState & {
  icon: LucideIcon;
  label: "Portfolio" | "Watchlist";
  layout: "card" | "detail";
  hoverOnly?: boolean;
}) {
  const name = label.toLowerCase();
  const visibleLabel = saved ? `In ${name}` : label;
  const description = unavailable
    ? `${label} is unavailable`
    : busy
      ? `Updating ${name}`
      : saved
        ? `Remove from ${name}`
        : `Add to ${name}`;
  const props = {
    "aria-label":
      layout === "detail" && saved
        ? `${visibleLabel}, ${description}`
        : description,
    "aria-pressed": saved,
    "aria-busy": busy,
    disabled: busy || unavailable,
    title: description,
    onClick: () => void onToggle(),
  };
  const icon = busy ? (
    <span className="app-btn__spinner" aria-hidden="true" />
  ) : (
    <Icon aria-hidden="true" fill={saved ? "currentColor" : "none"} />
  );
  const persistent = saved && !hoverOnly;
  return layout === "card" ? (
    <button
      {...props}
      className={`asset-save-button${saved ? " is-saved" : ""}${hoverOnly ? " asset-save-button--hover-only" : ""}${persistent ? " asset-save-button--persistent" : ""}`}
      type="button"
    >
      {icon}
    </button>
  ) : (
    <Button
      {...props}
      fullWidth
      size="large"
      variant={label === "Portfolio" ? "portfolio" : "default"}
      fill="ghost"
    >
      {icon}
      <span>{visibleLabel}</span>
    </Button>
  );
}

export type HoverOnlySaveAction = "portfolio" | "watchlist";

export function AssetSaveActions({
  item,
  onRequireAuth,
  portfolio,
  layout = "card",
  hoverOnlyAction,
}: {
  item: WatchlistItem;
  onRequireAuth?: () => void;
  portfolio: ActionState;
  layout?: "card" | "detail";
  hoverOnlyAction?: HoverOnlySaveAction;
}) {
  const { user } = useAuth();
  const cache = useWatchlistCache();
  const collection = usePortfolioCache();
  const { setWatched } = useWatchlist();
  const { id, type } = item;
  const watched = cache.isItemSaved(type, id);
  async function toggleWatchlist() {
    if (!user) {
      onRequireAuth?.();
      return;
    }
    if (cache.loadingReferences || cache.referencesError) return;
    await setWatched(item, !watched);
  }
  const portfolioHoverOnly =
    layout === "card" && hoverOnlyAction === "portfolio";
  const watchlistHoverOnly =
    layout === "card" && hoverOnlyAction === "watchlist";
  const singlePersistent =
    layout === "card" &&
    Number(portfolio.saved && !portfolioHoverOnly) +
      Number(watched && !watchlistHoverOnly) ===
      1;
  const portfolioButton = (
    <SaveButton
      {...portfolio}
      busy={portfolio.busy || collection.isItemUpdating(type, id)}
      icon={Star}
      label="Portfolio"
      layout={layout}
      hoverOnly={portfolioHoverOnly}
    />
  );
  const watchlistButton = (
    <SaveButton
      saved={watched}
      busy={cache.isItemUpdating(type, id) || cache.loadingReferences}
      unavailable={Boolean(cache.referencesError)}
      onToggle={toggleWatchlist}
      icon={Heart}
      label="Watchlist"
      layout={layout}
      hoverOnly={watchlistHoverOnly}
    />
  );

  return (
    <div
      className={`asset-save-actions asset-save-actions--${layout}${singlePersistent ? " asset-save-actions--single" : ""}`}
    >
      {layout === "card" ? watchlistButton : portfolioButton}
      {layout === "card" ? portfolioButton : watchlistButton}
    </div>
  );
}
