import React, { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import "./GridView.scss";

type GridViewProps = {
  children: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  revealOnScroll?: boolean;
  sorting?: boolean;
  subtitle?: React.ReactNode;
  title?: React.ReactNode;
};

export function GridView({
  children,
  collapsible = false,
  defaultCollapsed = false,
  revealOnScroll = true,
  sorting = false,
  subtitle,
  title,
}: GridViewProps) {
  const revealRef = useScrollReveal<HTMLDivElement>();
  const contentId = useId();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const categoryName = typeof title === "string" ? title : "card category";

  return (
    <div
      aria-busy={sorting || undefined}
      className={`grid-view${revealOnScroll ? " ui-scroll-reveal" : ""}`}
      ref={revealOnScroll ? revealRef : undefined}
    >
      {(title || subtitle) && (
        <header
          className={`grid-header${collapsible ? " grid-header--collapsible" : ""}`}
        >
          {title && <h3>{title}</h3>}
          {subtitle && (
            <small>
              <b>{subtitle}</b>
            </small>
          )}
          {collapsible && (
            <button
              aria-controls={contentId}
              aria-expanded={!collapsed}
              aria-label={`${collapsed ? "Expand" : "Collapse"} ${categoryName}`}
              className="grid-header__toggle"
              onClick={() => setCollapsed((current) => !current)}
              title={`${collapsed ? "Expand" : "Collapse"} ${categoryName}`}
              type="button"
            >
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
        hidden={collapsible && collapsed}
        id={collapsible ? contentId : undefined}
      >
        {children}
      </div>
    </div>
  );
}
