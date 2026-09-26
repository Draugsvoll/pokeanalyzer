import React from "react";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import "./GridView.scss";

type GridViewProps = {
  children: React.ReactNode;
  revealOnScroll?: boolean;
  subtitle?: React.ReactNode;
  title?: React.ReactNode;
};

export function GridView({
  children,
  revealOnScroll = true,
  subtitle,
  title,
}: GridViewProps) {
  const revealRef = useScrollReveal<HTMLDivElement>();

  return (
    <div
      className={`grid-view${revealOnScroll ? " ui-scroll-reveal" : ""}`}
      ref={revealOnScroll ? revealRef : undefined}
    >
      {(title || subtitle) && (
        <header className="grid-header">
          {title && <h3>{title}</h3>}
          {subtitle && (
            <small>
              <b>{subtitle}</b>
            </small>
          )}
        </header>
      )}
      <div className="card-grid">{children}</div>
    </div>
  );
}
