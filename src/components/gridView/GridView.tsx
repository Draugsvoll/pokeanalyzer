import React from "react";
import "./GridView.scss";

type GridViewProps = {
  children: React.ReactNode;
  className?: string;
  subtitle?: React.ReactNode;
  title?: React.ReactNode;
};

export function GridView({
  children,
  className = "",
  subtitle,
  title,
}: GridViewProps) {
  return (
    <div className="grid-view">
      {(title || subtitle) && (
        <header className="grid-header">
          {title && <h2>{title}</h2>}
          {subtitle && (
            <small>
              <b>{subtitle}</b>
            </small>
          )}
        </header>
      )}
      <div
        className={`card-grid grid-view-container${className ? ` ${className}` : ""}`}
      >
        {children}
      </div>
    </div>
  );
}
