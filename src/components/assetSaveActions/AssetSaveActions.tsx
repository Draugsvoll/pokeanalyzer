import { Heart, Star, type LucideIcon } from "lucide-react";
import Button from "../button/Button";
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
}: ActionState & {
  icon: LucideIcon;
  label: "Portfolio" | "Watchlist";
  layout: "card" | "detail";
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
  return layout === "card" ? (
    <button
      {...props}
      className={`asset-save-button${saved ? " is-saved" : ""}`}
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

export function AssetSaveActions({
  item,
  portfolio,
  layout = "card",
}: {
  item: WatchlistItem;
  portfolio: ActionState;
  layout?: "card" | "detail";
}) {
  const cache = useWatchlistCache();
  const collection = usePortfolioCache();
  const { setWatched } = useWatchlist();
  const { id, type } = item;
  const watched = cache.isItemSaved(type, id);
  async function toggleWatchlist() {
    if (cache.loadingReferences || cache.referencesError) return;
    await setWatched(item, !watched);
  }
  const portfolioButton = (
    <SaveButton
      {...portfolio}
      busy={portfolio.busy || collection.isItemUpdating(type, id)}
      icon={Star}
      label="Portfolio"
      layout={layout}
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
    />
  );

  return (
    <div className={`asset-save-actions asset-save-actions--${layout}`}>
      {layout === "card" ? watchlistButton : portfolioButton}
      {layout === "card" ? portfolioButton : watchlistButton}
    </div>
  );
}
