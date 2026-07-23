import React from "react";
import "./BaseCard.scss";

type BaseCardProps = {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
};

export default function BaseCard({ children, onClick, className }: BaseCardProps) {
  return (
    <div
      className={["base-card", className].filter(Boolean).join(" ")}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
