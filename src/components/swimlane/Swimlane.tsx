import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import "./Swimlane.scss";

type SwimlaneProps = {
  children: ReactNode;
  className?: string;
  size?: "auto" | "card";
};

export function Swimlane({
  children,
  className = "",
  size = "auto",
}: SwimlaneProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const classes = [
    "swimlane",
    `swimlane--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const updateScrollState = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
    setCanScrollLeft(viewport.scrollLeft > 1);
    setCanScrollRight(viewport.scrollLeft < maxScrollLeft - 1);
  };

  const scrollLane = (direction: "left" | "right") => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    viewport.scrollBy({
      behavior: "smooth",
      left: direction === "left" ? -viewport.clientWidth * 0.85 : viewport.clientWidth * 0.85,
    });
  };

  useEffect(() => {
    updateScrollState();

    const viewport = viewportRef.current;
    if (!viewport) return;

    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(viewport);

    return () => resizeObserver.disconnect();
  }, [children]);

  return (
    <div
      className={[
        "swimlane-shell",
        canScrollLeft ? "can-scroll-left" : "",
        canScrollRight ? "can-scroll-right" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={classes}
        onScroll={updateScrollState}
        ref={viewportRef}
      >
        {children}
      </div>
      <button
        aria-label="Scroll left"
        className="swimlane__control swimlane__control--left"
        disabled={!canScrollLeft}
        onClick={() => scrollLane("left")}
        type="button"
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <button
        aria-label="Scroll right"
        className="swimlane__control swimlane__control--right"
        disabled={!canScrollRight}
        onClick={() => scrollLane("right")}
        type="button"
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}
