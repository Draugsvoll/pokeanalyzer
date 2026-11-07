import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import type {
  MarketPriceHistoryResponse,
  MarketPriceHistorySource,
  MarketPriceHistoryPoint,
} from "../../../services/cardApi";
import { MarketDataUnavailable } from "./MarketDataUnavailable";
import { RadioButtonGroup } from "../../../components/radioButtonGroup/RadioButtonGroup";
import { monotoneAreaPath, monotoneLinePath } from "./marketPriceHistoryPaths";
import "./PokeTraceMarketPrices.scss";

const WIDTH = 800;
const HEIGHT = 304;
const PADDING = { top: 24, right: 10, bottom: 30, left: 46 };
const AXIS_LABEL_GAP = 8;
const SOURCES: MarketPriceHistorySource[] = ["tcgplayer", "ebay"];
type ChartSource = MarketPriceHistorySource | "graded";
const DAY_MS = 86_400_000;
const PERIOD_OPTIONS = [
  { value: "30", label: "1M" },
  { value: "90", label: "3M" },
  { value: "180", label: "6M" },
  { value: "all", label: "ALL" },
] as const;
type HistoryPeriod = (typeof PERIOD_OPTIONS)[number]["value"];

function dateTimestamp(date: string) {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function excludeExtremePricePoint(points: MarketPriceHistoryPoint[]) {
  let highest = 0;
  let secondHighest = 0;
  for (const { avg } of points) {
    if (avg >= highest) {
      secondHighest = highest;
      highest = avg;
    } else if (avg > secondHighest) {
      secondHighest = avg;
    }
  }
  return secondHighest > 0 && highest / secondHighest >= 4
    ? points.filter(({ avg }) => avg !== highest)
    : points;
}

function sourceLabel(source: ChartSource, gradedLabel?: string) {
  if (source === "graded") return gradedLabel ?? "Graded";
  return source === "tcgplayer" ? "TCGPlayer" : "Ebay";
}

function formatPrice(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatAxisPrice(value: number, currency: string, step: number) {
  const fractionDigits = Number.isInteger(step)
    ? 0
    : Math.max(2, Math.min(20, 1 - Math.floor(Math.log10(step))));
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: Math.min(2, fractionDigits),
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function formatDate(value: string, currentYear?: number) {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year:
      currentYear !== undefined && date.getUTCFullYear() < currentYear
        ? "numeric"
        : undefined,
    timeZone: "UTC",
  }).format(date);
}

function priceAxis(min: number, max: number) {
  const tolerance = Math.abs(max) * Number.EPSILON * 4;
  const candidates = [4, 3].map((intervals) => {
    const roughStep = (max - min) / intervals || (max < 1 ? 0.01 : 1);
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    let step = magnitude;
    for (const factor of [1, 1.5, 2, 2.5, 5, 10, 20]) {
      step = factor * magnitude;
      // Allow for floating-point rounding at an exact tick boundary.
      if (Math.floor(min / step) * step + intervals * step >= max - tolerance)
        break;
    }
    const lower = Math.max(0, Math.floor(min / step) * step);
    const upper = lower + intervals * step;
    const ticks = Array.from(
      { length: intervals + 1 },
      (_, index) => upper - index * step,
    );
    return { min: lower, max: upper, ticks, step };
  });
  // Prefer five gridlines when both scales cover the same range.
  return candidates.reduce((best, candidate) =>
    candidate.max - candidate.min < best.max - best.min - tolerance
      ? candidate
      : best,
  );
}

type MarketPriceHistoryChartData = Pick<
  MarketPriceHistoryResponse,
  "currency" | "series" | "stale"
>;

export function MarketPriceHistoryLoading({
  conditionLabel = "Near Mint",
  conditionControl,
}: {
  conditionLabel?: string;
  conditionControl?: ReactNode;
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
        </div>
        <div className="poketrace-market__history-controls">
          {conditionControl ?? <span>{conditionLabel}</span>}
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
  conditionControl,
  chartOverlay,
  ebayUpdatedOn,
  emptyDescription = "Historical prices are not available for this card yet.",
  history,
  gradedHistory,
  loading = false,
  gradeLoading = false,
}: {
  conditionLabel?: string;
  conditionControl?: ReactNode;
  chartOverlay?: ReactNode;
  ebayUpdatedOn?: string;
  emptyDescription?: string;
  history: MarketPriceHistoryChartData;
  gradedHistory?: {
    label: string;
    points: MarketPriceHistoryPoint[];
    stale?: boolean;
    updatedOn?: string;
  };
  loading?: boolean;
  gradeLoading?: boolean;
}) {
  const [selectedPeriod, setSelectedPeriod] = useState<HistoryPeriod>("90");
  const today = dateTimestamp(new Date().toISOString().slice(0, 10));
  const sources: ChartSource[] = gradedHistory
    ? [...SOURCES, "graded"]
    : SOURCES;
  const updatedOn = (source: ChartSource) =>
    source === "graded"
      ? gradedHistory?.updatedOn
      : source === "ebay"
        ? ebayUpdatedOn
        : undefined;
  const allSeries = sources.map((source) => ({
    source,
    points: excludeExtremePricePoint(
      [
        ...(source === "graded"
          ? (gradedHistory?.points ?? []).map((point) => ({
              ...point,
              avg: point.median30d ?? point.avg,
            }))
          : (history.series[source] ?? [])),
      ]
        .filter((point) => {
          const timestamp = dateTimestamp(point.date);
          const cutoff = updatedOn(source);
          return timestamp <= today && (!cutoff || point.date <= cutoff);
        })
        .sort((left, right) => left.date.localeCompare(right.date)),
    ),
  }));
  const oldestTimestamp = allSeries.reduce(
    (oldest, { points }) =>
      points.length ? Math.min(oldest, dateTimestamp(points[0].date)) : oldest,
    today,
  );
  const periodOptions = PERIOD_OPTIONS.filter((_, index) =>
    index === 0
      ? true
      : oldestTimestamp <
        today - Number(PERIOD_OPTIONS[index - 1].value) * DAY_MS,
  );
  const period = periodOptions.some(({ value }) => value === selectedPeriod)
    ? selectedPeriod
    : periodOptions[periodOptions.length - 1].value;
  const formatHistoryDate = (date: string) =>
    formatDate(
      date,
      period === "all" ? new Date(today).getUTCFullYear() : undefined,
    );
  const filteredSeries = allSeries
    .map(({ source, points }) => ({
      source,
      points: points.filter(
        (point) =>
          period === "all" ||
          dateTimestamp(point.date) >= today - Number(period) * DAY_MS,
      ),
    }))
    .filter(({ points }) => points.length > 0);
  const availableSources = filteredSeries.map(({ source }) => source);
  const [hoverDateIndex, setHoverDateIndex] = useState<number | null>(null);
  const chartId = useId().replaceAll(":", "");
  const glowId = `market-history-glow-${chartId}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const [axisFontSize, setAxisFontSize] = useState(12);
  const [leftPadding, setLeftPadding] = useState(PADDING.left);
  const hasHistory = availableSources.length > 0;
  const values = filteredSeries.flatMap(({ points }) =>
    points.map(({ avg }) => avg),
  );
  const axis = priceAxis(
    hasHistory ? Math.min(...values) : 0,
    hasHistory ? Math.max(...values) : 0,
  );
  const axisLabels = hasHistory
    ? axis.ticks.map((tick) =>
        formatAxisPrice(tick, history.currency, axis.step),
      )
    : [];
  const axisLabelKey = axisLabels.join("|");
  const title = (
    <div className="poketrace-market__history-title">
      <h3>Price history</h3>
    </div>
  );
  const controls = (
    <div className="poketrace-market__history-controls">
      {conditionControl ?? <span>{conditionLabel}</span>}
      <RadioButtonGroup
        ariaLabel="Price history period"
        className="poketrace-market__history-periods"
        options={periodOptions}
        value={period}
        onChange={(value) => {
          setSelectedPeriod(value);
          setHoverDateIndex(null);
        }}
      />
    </div>
  );

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const updateFontSize = () => {
      const width = svg.getBoundingClientRect().width;
      if (width <= 0) return;
      // Compensate for SVG scaling; keep rendered labels between 11 and 12px.
      const renderedSize = Math.max(11, Math.min(12, (12 * width) / WIDTH));
      setAxisFontSize((renderedSize * WIDTH) / width);
    };
    updateFontSize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateFontSize);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [hasHistory]);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const updateLabelSpace = () => {
      const labels = svg.querySelectorAll<SVGTextElement>(
        ".poketrace-market__history-axis-label:not(.poketrace-market__history-date-label)",
      );
      const widestLabel = Math.max(
        0,
        ...Array.from(labels, (label) => label.getComputedTextLength?.() ?? 0),
      );
      setLeftPadding(
        Math.max(PADDING.left, Math.ceil(widestLabel) + AXIS_LABEL_GAP * 2),
      );
    };
    updateLabelSpace();
    document.fonts?.addEventListener("loadingdone", updateLabelSpace);
    return () =>
      document.fonts?.removeEventListener("loadingdone", updateLabelSpace);
  }, [hasHistory, axisFontSize, axisLabelKey]);

  if (availableSources.length === 0) {
    return (
      <section
        aria-busy={loading}
        className={`poketrace-market__history default-container-inner${loading && gradeLoading ? " poketrace-market__history--grade-loading" : ""}`}
      >
        <header className="poketrace-market__history-header">
          {title}
          {controls}
        </header>
        {loading ? (
          <div
            aria-label="Loading marketplace price history"
            className="poketrace-market__history-loading-body"
            role="status"
          >
            <span aria-hidden="true" className="app-loading-spinner" />
          </div>
        ) : (
          <MarketDataUnavailable
            className="poketrace-market__history-empty"
            description={emptyDescription}
            title="No price history"
          />
        )}
      </section>
    );
  }

  const series = filteredSeries.map(({ source, points }) => ({
    source,
    points: points.map((point) => ({
      point,
      value: point.avg,
    })),
  }));
  const dates = [
    ...new Set(
      series.flatMap(({ points }) => points.map(({ point }) => point.date)),
    ),
  ].sort();
  const plotWidth = WIDTH - leftPadding - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const plotBottom = PADDING.top + plotHeight;
  const firstTimestamp = dateTimestamp(dates[0]);
  const lastTimestamp = dateTimestamp(dates.at(-1)!);
  const x = (date: string) => {
    if (firstTimestamp === lastTimestamp) {
      return leftPadding + plotWidth / 2;
    }
    return (
      leftPadding +
      ((dateTimestamp(date) - firstTimestamp) /
        (lastTimestamp - firstTimestamp)) *
        plotWidth
    );
  };
  const y = (value: number) =>
    PADDING.top + ((axis.max - value) / (axis.max - axis.min)) * plotHeight;
  const plottedSeries = series.map(({ source, points }) => {
    // Use the last known price on shared dates without a new observation.
    const positionedPoints = dates.flatMap((date) => {
      if (date > points.at(-1)!.point.date) return [];
      const latest = points.findLast(({ point }) => point.date <= date);
      return latest ? [{ x: x(date), y: y(latest.value) }] : [];
    });
    const lastDate = points.at(-1)!.point.date;
    const endX = updatedOn(source) ? x(lastDate) : x(dates.at(-1)!);
    return {
      source,
      points,
      line: monotoneLinePath(positionedPoints, endX),
      area: monotoneAreaPath(positionedPoints, endX, plotBottom),
    };
  });
  const dateTickCount = Math.min(
    7,
    Math.round((lastTimestamp - firstTimestamp) / DAY_MS) + 1,
  );
  const dateTicks = Array.from({ length: dateTickCount }, (_, index) => {
    const ratio = dateTickCount === 1 ? 0.5 : index / (dateTickCount - 1);
    return {
      date: new Date(firstTimestamp + ratio * (lastTimestamp - firstTimestamp))
        .toISOString()
        .slice(0, 10),
      x: leftPadding + ratio * plotWidth,
    };
  });
  const activeDateIndex = Math.min(
    hoverDateIndex ?? dates.length - 1,
    dates.length - 1,
  );
  const activeDate = dates[activeDateIndex];
  const activeX = x(activeDate);
  const activePoints = plottedSeries.map(({ source, points }) => {
    const lastDate = points.at(-1)!.point.date;
    if (updatedOn(source) && activeDate > lastDate) {
      return { source, point: null };
    }
    const latestPoint = points.findLast(
      ({ point }) => point.date <= activeDate,
    );
    return {
      source,
      point: latestPoint ?? null,
    };
  });
  const activePointYs = activePoints.flatMap(({ point }) =>
    point ? [y(point.value)] : [],
  );
  const activeTop = Math.min(...activePointYs);
  const tooltipViewportWidth = 192;
  const tooltipHeight = 44 + availableSources.length * 22;
  const tooltipX = Math.min(
    WIDTH - PADDING.right - tooltipViewportWidth,
    Math.max(leftPadding, activeX - tooltipViewportWidth / 2),
  );
  const tooltipY = Math.max(PADDING.top + 6, activeTop - tooltipHeight - 12);

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const chartX = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const ratio = Math.min(1, Math.max(0, (chartX - leftPadding) / plotWidth));
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

  const sourceNames = availableSources
    .map((source) => sourceLabel(source, gradedHistory?.label))
    .join(" and ");

  return (
    <section
      aria-busy={loading}
      className={`poketrace-market__history default-container-inner${loading && gradeLoading ? " poketrace-market__history--grade-loading" : ""}`}
    >
      <header className="poketrace-market__history-header">
        {title}
        {controls}
      </header>
      <div
        className={`poketrace-market__history-body${chartOverlay ? " poketrace-market__history-body--locked" : ""}`}
      >
        <div className="poketrace-market__history-chart">
          {loading && (
            <div
              aria-label="Loading marketplace price history"
              className="poketrace-market__history-refresh"
              role="status"
            >
              <span aria-hidden="true" className="app-loading-spinner" />
            </div>
          )}
          <svg
            ref={svgRef}
            style={
              {
                "--history-axis-font-size": `${axisFontSize}px`,
              } as CSSProperties
            }
            aria-label={`${sourceNames} ${conditionLabel} price history from ${formatHistoryDate(dates[0])} to ${formatHistoryDate(dates.at(-1)!)}`}
            onPointerLeave={() => setHoverDateIndex(null)}
            onPointerMove={loading ? undefined : handlePointerMove}
            role="img"
            aria-hidden={chartOverlay ? true : undefined}
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
                className={`poketrace-market__history-area poketrace-market__history-area--${source} ui-render-fade`}
                d={area}
                fill={`url(#market-history-area-${chartId}-${source})`}
                key={`${source}:${period}:${area}`}
              />
            ))}
            {dateTicks.map((tick) => (
              <line
                className="poketrace-market__history-grid-line poketrace-market__history-grid-line--vertical"
                key={tick.date}
                x1={tick.x}
                x2={tick.x}
                y1={PADDING.top}
                y2={PADDING.top + plotHeight}
              />
            ))}
            {axis.ticks.map((tick, index) => {
              const tickY = y(tick);
              return (
                <g key={tick}>
                  <line
                    className="poketrace-market__history-grid-line"
                    x1={leftPadding}
                    x2={WIDTH - PADDING.right}
                    y1={tickY}
                    y2={tickY}
                  />
                  <text
                    className="poketrace-market__history-axis-label"
                    textAnchor="end"
                    x={leftPadding - AXIS_LABEL_GAP}
                    y={tickY + 4}
                  >
                    {axisLabels[index]}
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
                className={`poketrace-market__history-line poketrace-market__history-line--${source} ui-render-fade`}
                d={line}
                filter={`url(#${glowId})`}
                key={`${source}:${period}:${line}`}
              />
            ))}
            {plottedSeries.map(({ source, points }) => {
              const onlyPoint = points.length === 1 ? points[0] : null;
              return onlyPoint ? (
                <circle
                  aria-hidden="true"
                  className={`poketrace-market__history-series-marker poketrace-market__history-series-marker--${source} ui-render-fade`}
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
            {hoverDateIndex !== null && !loading && (
              <foreignObject
                className="poketrace-market__history-tooltip"
                height={tooltipHeight}
                width={tooltipViewportWidth}
                x={tooltipX}
                y={tooltipY}
              >
                <div className="poketrace-market__history-tooltip-card">
                  <span className="poketrace-market__history-tooltip-date">
                    {formatHistoryDate(activeDate)}
                  </span>
                  {activePoints.map(({ source, point }) => (
                    <span
                      className={`poketrace-market__history-tooltip-row poketrace-market__history-tooltip-row--${source}`}
                      key={source}
                    >
                      <i aria-hidden="true" />
                      <span>{sourceLabel(source, gradedHistory?.label)}</span>
                      <strong>
                        {point
                          ? formatPrice(point.value, history.currency)
                          : "—"}
                      </strong>
                    </span>
                  ))}
                </div>
              </foreignObject>
            )}
            {dateTicks.map((tick, index) => (
              <text
                className="poketrace-market__history-axis-label poketrace-market__history-date-label"
                key={tick.date}
                textAnchor={
                  index === 0
                    ? "start"
                    : index === dateTicks.length - 1
                      ? "end"
                      : "middle"
                }
                x={tick.x}
                y={HEIGHT - 8}
              >
                {formatHistoryDate(tick.date)}
              </text>
            ))}
          </svg>
        </div>
        <div
          className="poketrace-market__history-meta"
          aria-hidden={chartOverlay ? true : undefined}
        >
          <div
            aria-label="Price history sources"
            className="poketrace-market__history-legend"
            role="group"
          >
            {filteredSeries.map(({ source, points }) => {
              const salesCount = points.every(
                ({ saleCount }) =>
                  typeof saleCount === "number" &&
                  Number.isSafeInteger(saleCount) &&
                  saleCount >= 0,
              )
                ? points.reduce(
                    (total, point) => total + (point.saleCount ?? 0),
                    0,
                  )
                : null;
              const countLabel =
                salesCount === null
                  ? "—"
                  : `${salesCount.toLocaleString("en-US")} sold`;
              return (
                <span
                  className={`poketrace-market__history-legend-item poketrace-market__history-legend-item--${source}`}
                  key={source}
                >
                  <i aria-hidden="true" />
                  <span>{sourceLabel(source, gradedHistory?.label)}</span>
                  <span
                    className="poketrace-market__history-sales-count ui-render-fade ui-render-fade--counter"
                    key={countLabel}
                  >
                    {countLabel}
                  </span>
                </span>
              );
            })}
          </div>
          {(history.stale || gradedHistory?.stale) && <span>Cached</span>}
        </div>
        {chartOverlay}
      </div>
    </section>
  );
}
