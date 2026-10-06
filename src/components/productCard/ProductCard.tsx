import type { ReactNode } from "react";
import "./ProductCard.scss";

type ProductCardProps = {
  as?: "article" | "div";
  children: ReactNode;
  className?: string;
  surfaceClassName?: string;
};

export function ProductCard({
  as: Root = "div",
  children,
  className,
  surfaceClassName,
}: ProductCardProps) {
  return (
    <Root className={["product-card", className].filter(Boolean).join(" ")}>
      <div
        className={["product-card__surface", surfaceClassName]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
    </Root>
  );
}
