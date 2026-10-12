import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import type { PokemonCard } from "../../types/pokemon";
import {
  PokemonCardView,
  type PokemonCardViewProps,
} from "../pokemonCardView/PokemonCardView";
import { GridView } from "../gridView/GridView";
import "./CardCategoryGrid.scss";

export type CardCategoryGridItem = {
  card: PokemonCard;
  marketDisplay?: PokemonCardViewProps["marketDisplay"];
};

type CardCategoryGridProps = {
  controls?: ReactNode;
  emptyMessage?: ReactNode;
  error?: ReactNode;
  footer?: ReactNode;
  items: CardCategoryGridItem[];
  loading?: boolean;
  minimized?: boolean;
  onRetry?: () => void;
  revealOnScroll?: boolean;
  sorting?: boolean;
  subtitle?: ReactNode;
  title?: ReactNode;
};

export function CardCategoryGrid({
  controls,
  emptyMessage = "No cards are available in this category yet.",
  error,
  footer,
  items,
  loading = false,
  minimized = false,
  onRetry,
  revealOnScroll = true,
  sorting = false,
  subtitle,
  title,
}: CardCategoryGridProps) {
  return (
    <section className="card-category-grid ui-render-fade">
      <GridView
        minimized={minimized}
        revealOnScroll={revealOnScroll}
        sorting={sorting}
        subtitle={subtitle}
        title={title}
      >
        {controls && (
          <div className="card-category-grid__controls" data-grid-full-width>
            {controls}
          </div>
        )}
        {loading ? (
          <div
            aria-label="Loading card category"
            data-grid-full-width
            className="card-category-grid__state"
            role="status"
          >
            <span aria-hidden="true" className="app-loading-spinner" />
          </div>
        ) : error ? (
          <div
            className="card-category-grid__state card-category-grid__state--error"
            role="alert"
            data-grid-full-width
          >
            <p>{error}</p>
            {onRetry && (
              <button
                className="card-category-grid__retry"
                onClick={onRetry}
                type="button"
              >
                <RefreshCw aria-hidden="true" />
                Try again
              </button>
            )}
          </div>
        ) : items.length === 0 && emptyMessage ? (
          <p className="card-category-grid__state" data-grid-full-width>
            {emptyMessage}
          </p>
        ) : items.length > 0 ? (
          items.map(({ card, marketDisplay }) => (
            <PokemonCardView
              card={card}
              key={card.id}
              marketDisplay={marketDisplay}
            />
          ))
        ) : null}
        {footer && !loading && !error && (
          <div className="card-category-grid__footer" data-grid-full-width>
            {footer}
          </div>
        )}
      </GridView>
    </section>
  );
}
