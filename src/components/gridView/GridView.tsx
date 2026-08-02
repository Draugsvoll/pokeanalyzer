import React from "react";
import "./GridView.scss";

type GridViewProps = {
  children: React.ReactNode;
  className?: string;
};

export function GridView({ children, className = "" }: GridViewProps) {
  return (
    <div
      className={`card-grid grid-view-container${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}
