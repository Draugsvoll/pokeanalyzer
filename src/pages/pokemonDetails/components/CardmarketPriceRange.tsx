import { useLayoutEffect, useRef } from "react";

export function CardmarketPriceRange({
  from,
  average30d,
  trend,
}: {
  from: string;
  average30d: string;
  trend: string;
}) {
  const rowRef = useRef<HTMLDListElement>(null);
  const averageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const average = averageRef.current;
    if (!row || !average) return;
    const update = () => {
      if (row.clientWidth <= 0) return;
      average.hidden = false;
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const requiredWidth = Array.from(row.children).reduce(
        (width, item) => width + item.getBoundingClientRect().width,
        gap * (row.children.length - 1),
      );
      average.hidden = requiredWidth > row.clientWidth;
    };
    update();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(row);
    document.fonts?.addEventListener("loadingdone", update);
    return () => {
      observer?.disconnect();
      document.fonts?.removeEventListener("loadingdone", update);
    };
  }, [from, average30d, trend]);

  return (
    <dl
      className="poketrace-market__range poketrace-market__range--cardmarket"
      ref={rowRef}
    >
      <div>
        <dt>From:</dt>
        <dd className="poketrace-market__range-price">{from}</dd>
      </div>
      <div ref={averageRef}>
        <dt>30d avg:</dt>
        <dd className="poketrace-market__range-price">{average30d}</dd>
      </div>
      <div>
        <dt>Trend:</dt>
        <dd className="poketrace-market__range-price">{trend}</dd>
      </div>
    </dl>
  );
}
