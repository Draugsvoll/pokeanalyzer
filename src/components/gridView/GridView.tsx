import React from "react";
import "./GridView.scss";

type GridViewProps = {
  children: React.ReactNode;
  subtitle?: React.ReactNode;
  title?: React.ReactNode;
};

export function GridView({ children, subtitle, title }: GridViewProps) {
  return (
    <div className="grid-view">
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
