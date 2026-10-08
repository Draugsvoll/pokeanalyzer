import { useId, useState, type PointerEvent } from "react";
import type {
  MarketPriceHistoryResponse,
  MarketPriceHistoryPoint,
  MarketPriceHistorySource,
} from "../../../services/cardApi";
import { MarketDataUnavailable } from "./MarketDataUnavailable";
import { monotoneAreaPath, monotoneLinePath } from "./marketPriceHistoryPaths";
import "./PokeTraceMarketPrices.scss";

const WIDTH = 800;
const HEIGHT = 268;
const PADDING = { top: 24, right: 10, bottom: 30, left: 50 };
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

type MarketPriceHistoryChartData = Pick<
  MarketPriceHistoryResponse,
  "currency" | "series" | "stale"
>;

export function MarketPriceHistoryLoading({
  conditionLabel = "Near Mint",
}: {
  conditionLabel?: string;
}) {
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
          <span>{conditionLabel} · 90 days</span>
        </div>
      </header>
      <div className="poketrace-market__history-loading-body">
        <span aria-hidden="true" className="app-loading-spinner" />
      </div>
    </section>
  );
}

export function MarketPriceHistoryChart({
  conditionLabel = "Near Mint",
  emptyDescription = "Historical prices are not available for this card yet.",
  history,
}: {
  conditionLabel?: string;
  emptyDescription?: string;
  history: MarketPriceHistoryChartData;
}) {
  const availableSources = SOURCES.filter(
    (source) => (history.series[source]?.length ?? 0) > 0,
  );
  const [hoverDateIndex, setHoverDateIndex] = useState<number | null>(null);
  const chartId = useId().replaceAll(":", "");
  const glowId = `market-history-glow-${chartId}`;

  if (availableSources.length === 0) {
    return (
      <section className="poketrace-market__history default-container-inner">
        <header className="poketrace-market__history-header">
          <div className="poketrace-market__history-title">
            <h3>Price history</h3>
            <span>{conditionLabel} · 90 days</span>
          </div>
        </header>
        <MarketDataUnavailable
          className="poketrace-market__history-empty"
          description={emptyDescription}
          title="No price history"
        />
      </section>
    );
  }

  const series = availableSources.map((source) => ({
    source,
    points: [...(history.series[source] ?? [])]
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((point) => ({
        point,
        value: chartValue(point, source),
      })),
  }));
  const dates = [
    ...new Set(
      series.flatMap(({ points }) => points.map(({ point }) => point.date)),
    ),
  ].sort();
  const values = series.flatMap(({ points }) =>
    points.map(({ value }) => value),
  );
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(rawMax - rawMin, Math.max(rawMax * 0.04, 1));
  const axis = priceAxis(
    Math.max(0, rawMin - spread * 0.12),
    rawMax + spread * 0.12,
  );
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const plotBottom = PADDING.top + plotHeight;
  const dateTimestamp = (date: string) =>
    new Date(`${date}T00:00:00Z`).getTime();
  const firstTimestamp = dateTimestamp(dates[0]);
  const lastTimestamp = dateTimestamp(dates.at(-1)!);
  const x = (date: string) => {
    if (firstTimestamp === lastTimestamp) {
      return PADDING.left + plotWidth / 2;
    }
    return (
      PADDING.left +
      ((dateTimestamp(date) - firstTimestamp) /
        (lastTimestamp - firstTimestamp)) *
        plotWidth
    );
  };
  const y = (value: number) =>
    PADDING.top + ((axis.max - value) / (axis.max - axis.min)) * plotHeight;
  const plottedSeries = series.map(({ source, points }) => {
    const positionedPoints = points.map(({ point, value }) => ({
      x: x(point.date),
      y: y(value),
    }));
    return {
      source,
      points,
      line: monotoneLinePath(positionedPoints, x(dates.at(-1)!)),
      area: monotoneAreaPath(positionedPoints, x(dates.at(-1)!), plotBottom),
    };
  });
  const dateTickCount = Math.min(7, dates.length);
  const dateTickIndexes = [
    ...new Set(
      Array.from({ length: dateTickCount }, (_, index) =>
        Math.round(
          (index / Math.max(dateTickCount - 1, 1)) * (dates.length - 1),
        ),
      ),
    ),
  ];
  const activeDateIndex = Math.min(
    hoverDateIndex ?? dates.length - 1,
    dates.length - 1,
  );
  const activeDate = dates[activeDateIndex];
  const activeX = x(activeDate);
  const activePoints = plottedSeries.map(({ source, points }) => {
    const exactPoint = points.find(({ point }) => point.date === activeDate);
    const carriedPoint = points.findLast(
      ({ point }) => point.date <= activeDate,
    );
    return {
      source,
      point: exactPoint ?? carriedPoint ?? null,
    };
  });
  const activePointYs = activePoints.flatMap(({ point }) =>
    point ? [y(point.value)] : [],
  );
  const activeTop = Math.min(...activePointYs);
  const tooltipViewportWidth = 208;
  const tooltipHeight = availableSources.length > 1 ? 88 : 66;
  const tooltipX = Math.min(
    WIDTH - PADDING.right - tooltipViewportWidth,
    Math.max(PADDING.left, activeX - tooltipViewportWidth / 2),
  );
  const tooltipY = Math.max(PADDING.top + 6, activeTop - tooltipHeight - 12);

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const chartX = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const ratio = Math.min(1, Math.max(0, (chartX - PADDING.left) / plotWidth));
    const targetTimestamp =
      firstTimestamp + ratio * (lastTimestamp - firstTimestamp);
    const nearestDateIndex = dates.reduce(
      (nearest, date, index) =>
        Math.abs(dateTimestamp(date) - targetTimestamp) <
        Math.abs(dateTimestamp(dates[nearest]) - targetTimestamp)
          ? index
          : nearest,
      0,
    );
    setHoverDateIndex(nearestDateIndex);
  }

  const sourceNames = availableSources.map(sourceLabel).join(" and ");

  return (
    <section className="poketrace-market__history default-container-inner">
      <header className="poketrace-market__history-header">
        <div className="poketrace-market__history-title">
          <h3>Price history</h3>
          <span>{conditionLabel} · 90 days</span>
        </div>
        <div className="poketrace-market__history-meta">
          <div
            aria-label="Price history sources"
            className="poketrace-market__history-legend"
            role="group"
          >
            {availableSources.map((source) => (
              <span
                className={`poketrace-market__history-legend-item poketrace-market__history-legend-item--${source}`}
                key={source}
              >
                <i aria-hidden="true" />
                {sourceLabel(source)}
              </span>
            ))}
          </div>
          {history.stale && <span>Cached</span>}
        </div>
      </header>
      <div className="poketrace-market__history-chart ui-render-fade">
        <svg
          aria-label={`${sourceNames} ${conditionLabel} price history from ${formatDate(dates[0])} to ${formatDate(dates.at(-1)!)}`}
          onPointerLeave={() => setHoverDateIndex(null)}
          onPointerMove={handlePointerMove}
          role="img"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        >
          <defs>
            <filter
              filterUnits="userSpaceOnUse"
              id={glowId}
              height={HEIGHT + 8}
              width={WIDTH + 8}
              x={-4}
              y={-4}
            >
              <feGaussianBlur stdDeviation="0.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {availableSources.map((source) => (
              <linearGradient
                id={`market-history-area-${chartId}-${source}`}
                key={source}
                x1="0"
                x2="0"
                y1="0"
                y2="1"
              >
                <stop
                  className={`poketrace-market__history-area-stop poketrace-market__history-area-stop--${source}`}
                  offset="0%"
                  stopOpacity="0.13"
                />
                <stop
                  className={`poketrace-market__history-area-stop poketrace-market__history-area-stop--${source}`}
                  offset="72%"
                  stopOpacity="0.045"
                />
                <stop
                  className={`poketrace-market__history-area-stop poketrace-market__history-area-stop--${source}`}
                  offset="100%"
                  stopOpacity="0"
                />
              </linearGradient>
            ))}
          </defs>
          {plottedSeries.map(({ source, area }) => (
            <path
              aria-hidden="true"
              className={`poketrace-market__history-area poketrace-market__history-area--${source}`}
              d={area}
              fill={`url(#market-history-area-${chartId}-${source})`}
              key={source}
            />
          ))}
          {dateTickIndexes.map((index) => (
            <line
              className="poketrace-market__history-grid-line poketrace-market__history-grid-line--vertical"
              key={index}
              x1={x(dates[index])}
              x2={x(dates[index])}
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
                  x={PADDING.left - 8}
                  y={tickY + 4}
                >
                  {formatAxisPrice(tick, history.currency)}
                </text>
              </g>
            );
          })}
          <line
            className="poketrace-market__history-latest-guide"
            x1={activeX}
            x2={activeX}
            y1={PADDING.top}
            y2={PADDING.top + plotHeight}
          />
          {plottedSeries.map(({ source, line }) => (
            <path
              className={`poketrace-market__history-line poketrace-market__history-line--${source}`}
              d={line}
              filter={`url(#${glowId})`}
              key={source}
            />
          ))}
          {plottedSeries.map(({ source, points }) => {
            const onlyPoint = points.length === 1 ? points[0] : null;
            return onlyPoint ? (
              <circle
                aria-hidden="true"
                className={`poketrace-market__history-series-marker poketrace-market__history-series-marker--${source}`}
                cx={x(onlyPoint.point.date)}
                cy={y(onlyPoint.value)}
                key={source}
                r="3"
              />
            ) : null;
          })}
          {activePoints.map(({ source, point }) =>
            point ? (
              <g key={source}>
                <circle
                  className={`poketrace-market__history-point-halo poketrace-market__history-point-halo--${source}`}
                  cx={activeX}
                  cy={y(point.value)}
                  r="6"
                />
                <circle
                  className={`poketrace-market__history-point poketrace-market__history-point--${source}`}
                  cx={activeX}
                  cy={y(point.value)}
                  r="2.5"
                />
              </g>
            ) : null,
          )}
          {hoverDateIndex !== null && (
            <foreignObject
              className="poketrace-market__history-tooltip"
              height={tooltipHeight}
              width={tooltipViewportWidth}
              x={tooltipX}
              y={tooltipY}
            >
              <div className="poketrace-market__history-tooltip-card">
                <span className="poketrace-market__history-tooltip-date">
                  {formatDate(activeDate)}
                </span>
                {activePoints.map(({ source, point }) => (
                  <span
                    className={`poketrace-market__history-tooltip-row poketrace-market__history-tooltip-row--${source}`}
                    key={source}
                  >
                    <i aria-hidden="true" />
                    <span>{sourceLabel(source)}</span>
                    <strong>
                      {point ? formatPrice(point.value, history.currency) : "—"}
                    </strong>
                  </span>
                ))}
              </div>
            </foreignObject>
          )}
          {dateTickIndexes.map((index) => (
            <text
              className="poketrace-market__history-axis-label"
              key={index}
              textAnchor={
                index === 0
                  ? "start"
                  : index === dates.length - 1
                    ? "end"
                    : "middle"
              }
              x={x(dates[index])}
              y={HEIGHT - 8}
            >
              {formatDate(dates[index])}
            </text>
          ))}
        </svg>
      </div>
    </section>
  );
}
