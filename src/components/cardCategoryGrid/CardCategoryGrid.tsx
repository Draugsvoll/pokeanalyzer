import type { ReactNode } from "react";
import type { PokemonCard } from "../../types/pokemon";
import {
  PokemonCardView,
  type PokemonCardViewProps,
} from "../pokemonCardView/PokemonCardView";
import { GridView } from "../gridView/GridView";
import "./CardCategoryGrid.scss";
import { useGradingOpportunityFilter } from "../../hooks/useGradingOpportunityFilter";
import { GradingOpportunityFilter } from "../gradingOpportunitiesGrid/GradingOpportunityFilter";
import { GradingOpportunityBadge } from "../gradingOpportunitiesGrid/GradingOpportunityBadge";

export type CardCategoryGridItem = {
  card: PokemonCard;
  badge?: ReactNode;
  marketDisplay?: PokemonCardViewProps["marketDisplay"];
};

type CardCategoryGridProps = {
  allowGradingFilter?: boolean;
  defaultExpanded?: boolean;
  controls?: ReactNode;
  emptyMessage?: ReactNode;
  error?: ReactNode;
  footer?: ReactNode;
  items: CardCategoryGridItem[];
  loading?: boolean;
  minimized?: boolean;
  revealOnScroll?: boolean;
  sorting?: boolean;
  subtitle?: ReactNode;
  title?: ReactNode;
};

export function CardCategoryGrid({
  allowGradingFilter = true,
  defaultExpanded = false,
  controls,
  emptyMessage = "No cards are available in this category yet.",
  error,
  footer,
  items,
  loading = false,
  minimized = false,
  revealOnScroll = true,
  sorting = false,
  subtitle,
  title,
}: CardCategoryGridProps) {
  const grading = useGradingOpportunityFilter(
    allowGradingFilter && !loading && !error && items.length > 0,
  );
  const qualifyingItems = grading.available
    ? items.filter(({ card }) => grading.multiplier(card) !== null)
    : [];
  const displayedItems = grading.active ? qualifyingItems : items;
  return (
    <section className="card-category-grid ui-render-fade">
      <GridView
        defaultExpanded={defaultExpanded}
        headerControls={
          grading.available &&
          qualifyingItems.length > 0 && (
            <GradingOpportunityFilter
              checked={grading.active}
              count={qualifyingItems.length}
              onChange={grading.setEnabled}
            />
          )
        }
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
          </div>
        ) : displayedItems.length === 0 && emptyMessage ? (
          <p className="card-category-grid__state" data-grid-full-width>
            {grading.active
              ? "No grading opportunities in these cards."
              : emptyMessage}
          </p>
        ) : displayedItems.length > 0 ? (
          displayedItems.map(({ card, marketDisplay, badge }) => (
            <PokemonCardView
              card={card}
              key={card.id}
              marketDisplay={grading.active ? undefined : marketDisplay}
              badge={
                grading.active ? (
                  <GradingOpportunityBadge
                    multiplier={grading.multiplier(card)!}
                  />
                ) : (
                  badge
                )
              }
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
