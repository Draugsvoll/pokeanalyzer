import React from "react";
import "./GridView.scss";

type GridViewProps = {
  children: React.ReactNode;
};

export function GridView({ children }: GridViewProps) {
  return <div className="grid-view-container">{children}</div>;
}
