import { useId, useMemo, useState, type PointerEvent } from "react";
import { Layers3 } from "lucide-react";
import type {
  JustTcgPricePoint,
  JustTcgVariant,
  JustTcgVariantGroup,
} from "./justTcgTypes";

const VIEWBOX_WIDTH = 800;
const VIEWBOX_HEIGHT = 300;
const PLOT_LEFT = 34;
const PLOT_RIGHT = 8;
const PLOT_TOP = 20;
const PLOT_BOTTOM = 38;
const PLOT_WIDTH = VIEWBOX_WIDTH - PLOT_LEFT - PLOT_RIGHT;
const PLOT_HEIGHT = VIEWBOX_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
const Y_TICK_COUNT = 6;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Client-side windows over the 180d JustTCG series (API max). */
const HISTORY_PERIODS = [
  { id: "7d", label: "7D", changeLabel: "7-day change", days: 7 },
  { id: "30d", label: "30D", changeLabel: "30-day change", days: 30 },
  { id: "90d", label: "90D", changeLabel: "90-day change", days: 90 },
  { id: "180d", label: "180D", changeLabel: "180-day change", days: 180 },
] as const;

type HistoryPeriodId = (typeof HISTORY_PERIODS)[number]["id"];

function filterHistoryByPeriod(
  points: JustTcgPricePoint[],
  days: number,
): JustTcgPricePoint[] {
  if (points.length === 0) return [];

  const latestTimestamp = points.at(-1)!.timestamp;
  const cutoff = latestTimestamp - days * MS_PER_DAY;
  const filtered = points.filter((point) => point.timestamp >= cutoff);

  // Sparse series: keep the last point before the window so the chart can start.
  if (
    filtered.length > 0 &&
    filtered[0].timestamp > cutoff &&
    filtered.length < points.length
  ) {
    const priorIndex = points.findIndex(
      (point) => point.timestamp === filtered[0].timestamp,
    );
    if (priorIndex > 0) {
      return [points[priorIndex - 1], ...filtered];
    }
  }

  return filtered;
}

export function JustTcgHistoryIntro() {
  return (
    <div className="just-tcg-history__intro">
      <h3 className="feature-section-heading">Ungraded Sales</h3>
      <p>
        Aggregated sales •{" "}
        <strong>JustTCG</strong>.
      </p>
    </div>
  );
}

const shortDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const longDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

function formatUsd(value: number | undefined) {
  if (value === undefined) return "—";

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatAxisPrice(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: value >= 100 ? 0 : 2,
    notation: value >= 10_000 ? "compact" : "standard",
    style: "currency",
  }).format(value);
}

function formatDate(timestamp: number, includeYear = false) {
  const formatter = includeYear ? longDateFormatter : shortDateFormatter;
  return formatter.format(new Date(timestamp));
}

function createSmoothPath(points: { x: number; y: number }[]) {
  if (!points.length) return "";
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;

  return points.slice(1).reduce((path, point, index) => {
    const pointIndex = index + 1;
    const previous = points[pointIndex - 1];
    const beforePrevious = points[pointIndex - 2] ?? previous;
    const next = points[pointIndex + 1] ?? point;
    const tension = 0.12;
    const firstControlX = previous.x + (point.x - beforePrevious.x) * tension;
    const firstControlY = previous.y + (point.y - beforePrevious.y) * tension;
    const secondControlX = point.x - (next.x - previous.x) * tension;
    const secondControlY = point.y - (next.y - previous.y) * tension;

    return `${path} C${firstControlX},${firstControlY} ${secondControlX},${secondControlY} ${point.x},${point.y}`;
  }, `M${points[0].x},${points[0].y}`);
}

function getChartGeometry(points: JustTcgPricePoint[]) {
  const firstTimestamp = points[0].timestamp;
  const lastTimestamp = points.at(-1)!.timestamp;
  const timestampRange = Math.max(1, lastTimestamp - firstTimestamp);
  const prices = points.map((point) => point.price);
  const rawMinimum = Math.min(...prices);
  const rawMaximum = Math.max(...prices);
  const rawRange = rawMaximum - rawMinimum;
  const padding =
    rawRange > 0 ? rawRange * 0.1 : Math.max(rawMaximum * 0.08, 1);
  const minimum = Math.max(0, rawMinimum - padding);
  const maximum = rawMaximum + padding;
  const priceRange = Math.max(1, maximum - minimum);

  const positioned = points.map((point) => ({
    ...point,
    x:
      PLOT_LEFT +
      ((point.timestamp - firstTimestamp) / timestampRange) * PLOT_WIDTH,
    y: PLOT_TOP + (1 - (point.price - minimum) / priceRange) * PLOT_HEIGHT,
  }));
  const linePath = createSmoothPath(positioned);
  const areaPath = `${linePath} L${positioned.at(-1)!.x},${
    PLOT_TOP + PLOT_HEIGHT
  } L${positioned[0].x},${PLOT_TOP + PLOT_HEIGHT} Z`;

  return {
    areaPath,
    linePath,
    maximum,
    minimum,
    positioned,
  };
}

function getEvenlySpacedPoints(points: JustTcgPricePoint[], count: number) {
  if (points.length <= count) return points;

  const indexes = Array.from({ length: count }, (_, index) =>
    Math.round((index / (count - 1)) * (points.length - 1)),
  );
  return indexes.map((index) => points[index]);
}

function PriceHistoryChart({
  variant,
  points,
  changeLabel,
  periodKey,
}: {
  variant: JustTcgVariant;
  points: JustTcgPricePoint[];
  changeLabel: string;
  periodKey: string;
}) {
  const gradientId = useId().replaceAll(":", "");
  const [hoveredPointState, setHoveredPointState] = useState<{
    index: number;
    periodKey: string;
  } | null>(null);
  const geometry = useMemo(() => getChartGeometry(points), [points]);
  const hoveredIndex =
    hoveredPointState?.periodKey === periodKey ? hoveredPointState.index : null;
  const hoveredPoint =
    hoveredIndex === null ? null : geometry.positioned[hoveredIndex];
  const dateTicks = getEvenlySpacedPoints(points, 5);
  const latest = points.at(-1)!;
  const first = points[0];
  const currentMarketPrice = variant.price ?? latest.price;
  // Change over the selected window (window start → latest in series)
  const change = latest.price - first.price;
  const changePercent = first.price > 0 ? (change / first.price) * 100 : null;

  function updateHoveredPoint(event: PointerEvent<SVGRectElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX =
      ((event.clientX - bounds.left) / bounds.width) * VIEWBOX_WIDTH;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    geometry.positioned.forEach((point, index) => {
      const distance = Math.abs(point.x - pointerX);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    setHoveredPointState({ index: closestIndex, periodKey });
  }

  return (
    <>
      <div className="just-tcg-history__summary">
        <div className="just-tcg-history__latest">
          <span>Market price</span>
          <strong>{formatUsd(currentMarketPrice)}</strong>
          <small>{formatDate(latest.timestamp, true)}</small>
        </div>
        <div>
          <span>{changeLabel}</span>
          <strong
            className={
              change > 0
                ? "is-positive"
                : change < 0
                  ? "is-negative"
                  : undefined
            }
          >
            {change > 0 ? "+" : ""}
            {formatUsd(change)}
            {changePercent !== null && (
              <small>
                {changePercent > 0 ? "+" : ""}
                {changePercent.toFixed(1)}%
              </small>
            )}
          </strong>
        </div>
        <div className="just-tcg-history__all-time-high">
          <span>All-time high</span>
          <strong>
            {variant.allTimeHigh === undefined
              ? "—"
              : formatUsd(variant.allTimeHigh)}
          </strong>
          {variant.allTimeHighDate && (
            <small>{formatStatisticDate(variant.allTimeHighDate)}</small>
          )}
        </div>
        <div className="just-tcg-history__all-time-low">
          <span>All-time low</span>
          <strong>
            {variant.allTimeLow === undefined
              ? "—"
              : formatUsd(variant.allTimeLow)}
          </strong>
          {variant.allTimeLowDate && (
            <small>{formatStatisticDate(variant.allTimeLowDate)}</small>
          )}
        </div>
      </div>

      <div className="just-tcg-history__chart-wrap" key={periodKey}>
        <svg
          className="just-tcg-history__chart"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          role="img"
          aria-label={`${variant.printing} ${variant.condition} price history from ${formatDate(first.timestamp, true)} to ${formatDate(latest.timestamp, true)}`}
          onPointerLeave={() => setHoveredPointState(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          {Array.from({ length: Y_TICK_COUNT }, (_, index) => {
            const ratio = index / (Y_TICK_COUNT - 1);
            const y = PLOT_TOP + ratio * PLOT_HEIGHT;
            const value =
              geometry.maximum - ratio * (geometry.maximum - geometry.minimum);
            return (
              <g className="just-tcg-history__grid-line" key={index}>
                <line
                  x1={PLOT_LEFT}
                  x2={VIEWBOX_WIDTH - PLOT_RIGHT}
                  y1={y}
                  y2={y}
                />
                <text x={PLOT_LEFT - 12} y={y + 4}>
                  {formatAxisPrice(value)}
                </text>
              </g>
            );
          })}

          {dateTicks.map((point) => {
            const positioned = geometry.positioned.find(
              (candidate) => candidate.timestamp === point.timestamp,
            )!;
            return (
              <text
                className="just-tcg-history__date-tick"
                key={point.timestamp}
                textAnchor={
                  point === dateTicks[0]
                    ? "start"
                    : point === dateTicks.at(-1)
                      ? "end"
                      : "middle"
                }
                x={positioned.x}
                y={VIEWBOX_HEIGHT - 12}
              >
                {formatDate(point.timestamp)}
              </text>
            );
          })}

          <path
            className="just-tcg-history__area"
            d={geometry.areaPath}
            fill={`url(#${gradientId})`}
          />
          <path className="just-tcg-history__line" d={geometry.linePath} />

          {hoveredPoint && (
            <g className="just-tcg-history__hover">
              <line
                x1={hoveredPoint.x}
                x2={hoveredPoint.x}
                y1={PLOT_TOP}
                y2={PLOT_TOP + PLOT_HEIGHT}
              />
              <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="5" />
            </g>
          )}

          <rect
            className="just-tcg-history__interaction"
            x={PLOT_LEFT}
            y={PLOT_TOP}
            width={PLOT_WIDTH}
            height={PLOT_HEIGHT}
            onPointerMove={updateHoveredPoint}
          />
        </svg>

        {hoveredPoint && (
          <div
            className="just-tcg-history__tooltip"
            style={{
              left: `${(hoveredPoint.x / VIEWBOX_WIDTH) * 100}%`,
              top: `${(hoveredPoint.y / VIEWBOX_HEIGHT) * 100}%`,
            }}
          >
            <strong>{formatUsd(hoveredPoint.price)}</strong>
            <span>{formatDate(hoveredPoint.timestamp, true)}</span>
          </div>
        )}
      </div>
    </>
  );
}

export function JustTcgPriceHistory({
  groups,
}: {
  groups: JustTcgVariantGroup[];
}) {
  const controlId = useId().replaceAll(":", "");
  const [selectedGroupId, setSelectedGroupId] = useState(
    () => groups[0]?.id ?? "",
  );
  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? groups[0];
  const [selectedCondition, setSelectedCondition] = useState(() => {
    const initialGroup = groups[0];
    return (
      initialGroup?.variants.find((variant) => variant.priceHistory.length >= 2)
        ?.condition ??
      initialGroup?.variants[0]?.condition ??
      ""
    );
  });
  const [selectedPeriodId, setSelectedPeriodId] =
    useState<HistoryPeriodId>("180d");
  const selectedVariant =
    selectedGroup?.variants.find(
      (variant) => variant.condition === selectedCondition,
    ) ?? selectedGroup?.variants[0];
  const selectedPeriod =
    HISTORY_PERIODS.find((period) => period.id === selectedPeriodId) ??
    HISTORY_PERIODS[HISTORY_PERIODS.length - 1];
  const periodPoints = useMemo(() => {
    if (!selectedVariant) return [];
    return filterHistoryByPeriod(
      selectedVariant.priceHistory,
      selectedPeriod.days,
    );
  }, [selectedVariant, selectedPeriod.days]);
  const multipleSets =
    new Set(groups.map((group) => group.setName).filter(Boolean)).size > 1;

  function selectGroup(groupId: string) {
    setSelectedGroupId(groupId);
    const nextGroup = groups.find((group) => group.id === groupId);
    const firstCondition =
      nextGroup?.variants.find((variant) => variant.priceHistory.length >= 2)
        ?.condition ?? nextGroup?.variants[0]?.condition;
    if (firstCondition) setSelectedCondition(firstCondition);
  }

  if (!selectedGroup || !selectedVariant) {
    return (
      <section className="just-tcg-history just-tcg-history--empty feature-card-surface ui-render-fade">
        <header>
          <JustTcgHistoryIntro />
        </header>
        <p>Historical pricing is unavailable for this card.</p>
      </section>
    );
  }

  return (
    <section className="just-tcg-history feature-card-surface ui-render-fade">
      <header>
        <JustTcgHistoryIntro />
        <div className="just-tcg-history__controls">
          <fieldset
            aria-label="Variant"
            className="just-tcg-history__radio-group just-tcg-history__radio-group--variant feature-variant-radio-group"
          >
            <div>
              {groups.map((group) => (
                <label key={group.id}>
                  <input
                    checked={selectedGroup.id === group.id}
                    name={`${controlId}-variant`}
                    type="radio"
                    value={group.id}
                    onChange={() => selectGroup(group.id)}
                  />
                  <span>
                    <Layers3 aria-hidden="true" />
                    <strong>{group.printing}</strong>
                    {multipleSets && group.setName && (
                      <>
                        <i aria-hidden="true">•</i>
                        <small>{group.setName}</small>
                      </>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="just-tcg-history__segment-row">
            <fieldset
              aria-label="Condition"
              className="just-tcg-history__radio-group just-tcg-history__radio-group--segment just-tcg-history__radio-group--condition"
            >
              <div>
                {selectedGroup.variants.map((variant) => (
                  <label key={variant.id}>
                    <input
                      checked={selectedVariant.condition === variant.condition}
                      name={`${controlId}-condition`}
                      type="radio"
                      value={variant.condition}
                      onChange={() => setSelectedCondition(variant.condition)}
                    />
                    <span>{variant.condition}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset
              aria-label="Time period"
              className="just-tcg-history__radio-group just-tcg-history__radio-group--segment just-tcg-history__radio-group--period"
            >
              <div>
                {HISTORY_PERIODS.map((period) => (
                  <label key={period.id}>
                    <input
                      checked={selectedPeriodId === period.id}
                      name={`${controlId}-period`}
                      type="radio"
                      value={period.id}
                      onChange={() => setSelectedPeriodId(period.id)}
                    />
                    <span>{period.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>
      </header>
      {selectedVariant.priceHistory.length >= 2 && periodPoints.length >= 2 ? (
        <PriceHistoryChart
          changeLabel={selectedPeriod.changeLabel}
          periodKey={`${selectedVariant.id}-${selectedPeriod.id}`}
          points={periodPoints}
          variant={selectedVariant}
        />
      ) : (
        <div className="just-tcg-history__chart-empty" role="status">
          <strong>Historical pricing unavailable</strong>
          <span>
            {selectedVariant.priceHistory.length < 2
              ? `No price history was returned for ${selectedVariant.condition}.`
              : `Not enough data points for the ${selectedPeriod.label} window.`}
          </span>
        </div>
      )}
    </section>
  );
}

function formatStatisticDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : formatDate(timestamp, true);
}
