import { useId, useState, type PointerEvent } from "react";
import type {
  MarketPriceHistoryResponse,
  MarketPriceHistoryPoint,
  MarketPriceHistorySource,
} from "../../../services/cardApi";
import { MarketDataUnavailable } from "./MarketDataUnavailable";

const WIDTH = 800;
const HEIGHT = 268;
const PADDING = { top: 24, right: 10, bottom: 46, left: 60 };
const SOURCES: MarketPriceHistorySource[] = ["tcgplayer", "ebay"];

function sourceLabel(source: MarketPriceHistorySource) {
  return source === "tcgplayer" ? "TCGPlayer" : "eBay";
}

function formatPrice(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatAxisPrice(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function chartValue(
  point: MarketPriceHistoryPoint,
  source: MarketPriceHistorySource,
) {
  return source === "ebay" ? (point.median7d ?? point.avg) : point.avg;
}

function linePath(points: Array<{ x: number; y: number }>) {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
}

function priceAxis(min: number, max: number) {
  const roughStep = (max - min) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(roughStep, 1)));
  const normalized = roughStep / magnitude;
  const step =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) *
    magnitude;
  const lower = Math.max(0, Math.floor(min / step) * step);
  const upper = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = upper; value >= lower; value -= step) ticks.push(value);
  return { min: lower, max: upper, ticks };
}

export function MarketPriceHistoryLoading() {
  return (
    <section
      aria-label="Loading marketplace price history"
      aria-live="polite"
      className="poketrace-market__history poketrace-market__history--loading default-container-inner"
      role="status"
    >
      <header className="poketrace-market__history-header">
        <div className="poketrace-market__history-title">
          <h3>Price history</h3>
          <span>Near Mint</span>
        </div>
      </header>
      <div className="poketrace-market__history-loading-body">
        <span aria-hidden="true" className="app-loading-spinner" />
      </div>
    </section>
  );
}

export function MarketPriceHistoryChart({
  history,
}: {
  history: MarketPriceHistoryResponse;
}) {
  const availableSources = SOURCES.filter(
    (source) => (history.series[source]?.length ?? 0) > 0,
  );
  const [selectedSource, setSelectedSource] =
    useState<MarketPriceHistorySource>(availableSources[0] ?? "tcgplayer");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const sourceGroup = useId();
  const activeSource = availableSources.includes(selectedSource)
    ? selectedSource
    : availableSources[0];
  const points = activeSource ? (history.series[activeSource] ?? []) : [];

  if (!activeSource || points.length === 0) {
    return (
      <section className="poketrace-market__history default-container-inner">
        <header className="poketrace-market__history-header">
          <div className="poketrace-market__history-title">
            <h3>Price history</h3>
            <span>Near Mint</span>
          </div>
        </header>
        <MarketDataUnavailable
          className="poketrace-market__history-empty"
          description="Historical prices are not available for this card yet."
          title="No price history"
        />
      </section>
    );
  }

  const values = points.map((point) => chartValue(point, activeSource));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(rawMax - rawMin, Math.max(rawMax * 0.04, 1));
  const axis = priceAxis(
    Math.max(0, rawMin - spread * 0.12),
    rawMax + spread * 0.12,
  );
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = (index: number) =>
    PADDING.left +
    (points.length === 1
      ? plotWidth / 2
      : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) =>
    PADDING.top + ((axis.max - value) / (axis.max - axis.min)) * plotHeight;
  const line = linePath(
    points.map((point, index) => ({
      x: x(index),
      y: y(chartValue(point, activeSource)),
    })),
  );
  const area = `${line} L ${x(points.length - 1).toFixed(2)} ${(PADDING.top + plotHeight).toFixed(2)} L ${x(0).toFixed(2)} ${(PADDING.top + plotHeight).toFixed(2)} Z`;
  const latest = points.at(-1)!;
  const first = points[0];
  const dateTickCount = Math.min(7, points.length);
  const dateTickIndexes = [
    ...new Set(
      Array.from({ length: dateTickCount }, (_, index) =>
        Math.round(
          (index / Math.max(dateTickCount - 1, 1)) * (points.length - 1),
        ),
      ),
    ),
  ];
  const activeIndex = Math.min(
    hoverIndex ?? points.length - 1,
    points.length - 1,
  );
  const active = points[activeIndex];
  const activeX = x(activeIndex);
  const activeY = y(chartValue(active, activeSource));
  const tooltipWidth = 128;
  const tooltipHeight = 46;
  const tooltipX = Math.min(
    WIDTH - PADDING.right - tooltipWidth,
    Math.max(PADDING.left, activeX - tooltipWidth / 2),
  );
  const tooltipY = Math.max(PADDING.top + 6, activeY - tooltipHeight - 12);

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const chartX = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const ratio = Math.min(1, Math.max(0, (chartX - PADDING.left) / plotWidth));
    setHoverIndex(Math.round(ratio * (points.length - 1)));
  }

  return (
    <section
      className={`poketrace-market__history poketrace-market__history--${activeSource} default-container-inner`}
    >
      <header className="poketrace-market__history-header">
        <div className="poketrace-market__history-title">
          <h3>Price history</h3>
          <span>Near Mint</span>
        </div>
        <div className="poketrace-market__history-meta">
          <div
            aria-label="Price history source"
            className="poketrace-market__condition-tabs poketrace-market__history-source-tabs"
            role="radiogroup"
          >
            {availableSources.map((source) => (
              <label key={source}>
                <input
                  checked={source === activeSource}
                  name={sourceGroup}
                  onChange={() => {
                    setSelectedSource(source);
                    setHoverIndex(null);
                  }}
                  type="radio"
                  value={source}
                />
                <span>{sourceLabel(source)}</span>
              </label>
            ))}
          </div>
          {history.stale && <span>Cached</span>}
        </div>
      </header>
      <div
        className="poketrace-market__history-chart ui-render-fade"
        key={activeSource}
      >
        <svg
          aria-label={`${sourceLabel(activeSource)} Near Mint price history from ${formatDate(first.date)} to ${formatDate(latest.date)}`}
          onPointerLeave={() => setHoverIndex(null)}
          onPointerMove={handlePointerMove}
          role="img"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        >
          <defs>
            <linearGradient
              id="market-history-fill"
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop
                offset="0"
                stopColor="var(--history-accent)"
                stopOpacity="0.2"
              />
              <stop
                offset="1"
                stopColor="var(--history-accent)"
                stopOpacity="0"
              />
            </linearGradient>
            <filter
              id="market-history-glow"
              x="-10%"
              y="-20%"
              width="120%"
              height="140%"
            >
              <feGaussianBlur stdDeviation="1.15" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {dateTickIndexes.map((index) => (
            <line
              className="poketrace-market__history-grid-line poketrace-market__history-grid-line--vertical"
              key={index}
              x1={x(index)}
              x2={x(index)}
              y1={PADDING.top}
              y2={PADDING.top + plotHeight}
            />
          ))}
          {axis.ticks.map((tick) => {
            const tickY = y(tick);
            return (
              <g key={tick}>
                <line
                  className="poketrace-market__history-grid-line"
                  x1={PADDING.left}
                  x2={WIDTH - PADDING.right}
                  y1={tickY}
                  y2={tickY}
                />
                <text
                  className="poketrace-market__history-axis-label"
                  textAnchor="end"
                  x={PADDING.left - 10}
                  y={tickY + 4}
                >
                  {formatAxisPrice(tick, history.currency)}
                </text>
              </g>
            );
          })}
          <path className="poketrace-market__history-area" d={area} />
          <line
            className="poketrace-market__history-latest-guide"
            x1={activeX}
            x2={activeX}
            y1={PADDING.top}
            y2={PADDING.top + plotHeight}
          />
          <path
            className="poketrace-market__history-line"
            d={line}
            filter="url(#market-history-glow)"
          />
          <circle
            className="poketrace-market__history-point-halo"
            cx={activeX}
            cy={activeY}
            r="9"
          />
          <circle
            className="poketrace-market__history-point"
            cx={activeX}
            cy={activeY}
            r="4"
          />
          {hoverIndex !== null && (
            <g className="poketrace-market__history-tooltip">
              <rect
                height={tooltipHeight}
                rx="6"
                width={tooltipWidth}
                x={tooltipX}
                y={tooltipY}
              />
              <text x={tooltipX + 10} y={tooltipY + 19}>
                {formatPrice(
                  chartValue(active, activeSource),
                  history.currency,
                )}
              </text>
              <text x={tooltipX + 10} y={tooltipY + 36}>
                {formatDate(active.date)}
              </text>
            </g>
          )}
          {dateTickIndexes.map((index) => (
            <text
              className="poketrace-market__history-axis-label"
              key={index}
              textAnchor={
                index === 0
                  ? "start"
                  : index === points.length - 1
                    ? "end"
                    : "middle"
              }
              x={x(index)}
              y={HEIGHT - 8}
            >
              {formatDate(points[index].date)}
            </text>
          ))}
        </svg>
      </div>
    </section>
  );
}
