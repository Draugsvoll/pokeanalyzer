import React from "react";
import "./BaseCard.scss";

type BaseCardProps = {
  children: React.ReactNode;
  onClick?: () => void;
};

export default function BaseCard({ children, onClick }: BaseCardProps) {
  return (
    <div className="base-card" onClick={onClick}>
      {children}
    </div>
  );
}
