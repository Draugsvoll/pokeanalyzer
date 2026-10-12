import React, { useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import "./GridView.scss";

type GridViewProps = {
  children: React.ReactNode;
  minimized?: boolean;
  revealOnScroll?: boolean;
  sorting?: boolean;
  subtitle?: React.ReactNode;
  title?: React.ReactNode;
};

export function GridView({
  children,
  minimized = false,
  revealOnScroll = true,
  sorting = false,
  subtitle,
  title,
}: GridViewProps) {
  const revealRef = useScrollReveal<HTMLDivElement>();
  const contentId = useId();
  const [showAll, setShowAll] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const [hasMoreRows, setHasMoreRows] = useState(false);
  const canMinimize = minimized && Boolean(title || subtitle);
  const categoryName = typeof title === "string" ? title : "card category";
  const toggleable = canMinimize && hasMoreRows;
  const toggleLabel = `${showAll ? "Show less of" : "Show more of"} ${categoryName}`;

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!canMinimize || !grid) return;
    const update = () => {
      if (!grid.clientWidth) return;
      // Read the browser's resolved tracks, keeping the existing responsive CSS
      // as the single source of truth for the number of cards in a row.
      const columns = window.getComputedStyle(grid).gridTemplateColumns;
      const count =
        columns && columns !== "none" ? columns.trim().split(/\s+/).length : 1;
      let itemCount = 0;
      Array.from(grid.children).forEach((child) => {
        // Controls, loading/error messages and footers span the entire grid.
        const fullWidth = child.hasAttribute("data-grid-full-width");
        if (!fullWidth) itemCount += 1;
        child.toggleAttribute(
          "data-grid-overflow",
          !fullWidth && !showAll && itemCount > count,
        );
      });
      setHasMoreRows(itemCount > count);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(grid);
    return () => {
      observer.disconnect();
      Array.from(grid.children).forEach((child) =>
        child.removeAttribute("data-grid-overflow"),
      );
    };
  }, [children, canMinimize, showAll]);

  return (
    <div
      aria-busy={sorting || undefined}
      className={`grid-view${revealOnScroll ? " ui-scroll-reveal" : ""}`}
      ref={revealOnScroll ? revealRef : undefined}
    >
      {(title || subtitle) && (
        <header
          className={`grid-header${toggleable ? " grid-header--minimized" : ""}`}
        >
          {title && <h3>{title}</h3>}
          {subtitle && (
            <small className="grid-header__subtitle">{subtitle}</small>
          )}
          {toggleable && (
            <button
              aria-controls={contentId}
              aria-expanded={showAll}
              aria-label={toggleLabel}
              className="grid-header__toggle"
              onClick={() => setShowAll((current) => !current)}
              title={toggleLabel}
              type="button"
            >
              <span className="grid-header__toggle-label">
                {showAll ? "Show less" : "Show more"}
              </span>
              <ChevronDown
                aria-hidden="true"
                className="grid-header__chevron"
                size={18}
                strokeWidth={1.75}
              />
            </button>
          )}
        </header>
      )}
      <div
        className={`card-grid ui-card-grid-enter${sorting ? " card-grid--sorting" : ""}`}
        id={canMinimize ? contentId : undefined}
        ref={gridRef}
      >
        {children}
      </div>
    </div>
  );
}
