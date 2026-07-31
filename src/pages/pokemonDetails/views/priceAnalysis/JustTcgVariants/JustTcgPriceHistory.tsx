import { useId, useState, type PointerEvent } from "react";
import { Layers3 } from "lucide-react";
import { SelectDropdown } from "../../../../../components/selectDropdown/SelectDropdown";
import type {
  JustTcgPricePoint,
  JustTcgVariant,
  JustTcgVariantGroup,
} from "./justTcgTypes";

const VIEWBOX_WIDTH = 800;
const VIEWBOX_HEIGHT = 300;
const PLOT_LEFT = 68;
const PLOT_RIGHT = 22;
const PLOT_TOP = 20;
const PLOT_BOTTOM = 42;
const PLOT_WIDTH = VIEWBOX_WIDTH - PLOT_LEFT - PLOT_RIGHT;
const PLOT_HEIGHT = VIEWBOX_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
const Y_TICK_COUNT = 5;

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
  const linePath = positioned
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
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

function PriceHistoryChart({ variant }: { variant: JustTcgVariant }) {
  const gradientId = useId().replaceAll(":", "");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const points = variant.priceHistory;
  const geometry = getChartGeometry(points);
  const hoveredPoint =
    hoveredIndex === null ? null : geometry.positioned[hoveredIndex];
  const dateTicks = getEvenlySpacedPoints(points, 5);
  const latest = points.at(-1)!;
  const first = points[0];
  const currentMarketPrice = variant.price ?? latest.price;
  const change = currentMarketPrice - first.price;
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
    setHoveredIndex(closestIndex);
  }

  return (
    <>
      <div className="just-tcg-history__summary">
        <div className="just-tcg-history__latest">
          <span>Latest market price</span>
          <strong>{formatUsd(currentMarketPrice)}</strong>
          <small>{formatDate(latest.timestamp, true)}</small>
        </div>
        <div>
          <span>180-day change</span>
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

      <div className="just-tcg-history__chart-wrap">
        <svg
          className="just-tcg-history__chart"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          role="img"
          aria-label={`${variant.printing} ${variant.condition} price history from ${formatDate(first.timestamp, true)} to ${formatDate(latest.timestamp, true)}`}
          onPointerLeave={() => setHoveredIndex(null)}
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

function SelectedVariantPrices({ group }: { group: JustTcgVariantGroup }) {
  return (
    <div className="just-tcg-history__selected-prices">
      <section className="just-tcg-variants__section">
        <div className="just-tcg-variants__table-wrap">
          <table>
            <thead>
              <tr>
                <th>Condition</th>
                <th>Current Price</th>
                <th>All-Time High</th>
                <th>All-Time Low</th>
                <th>Below ATH</th>
              </tr>
            </thead>
            <tbody>
              {group.variants.map((variant) => {
                const canCalculateBelowAth =
                  variant.price !== undefined &&
                  variant.allTimeHigh !== undefined &&
                  variant.allTimeHigh > 0;
                const belowAmount = canCalculateBelowAth
                  ? Math.max(0, variant.allTimeHigh! - variant.price!)
                  : undefined;
                const belowPercent = canCalculateBelowAth
                  ? (belowAmount! / variant.allTimeHigh!) * 100
                  : undefined;

                return (
                  <tr key={variant.id}>
                    <td>{variant.condition}</td>
                    <td className="just-tcg-variants__current">
                      {formatUsd(variant.price)}
                    </td>
                    <td className="just-tcg-variants__high">
                      <span className="just-tcg-variants__stat">
                        <span className="just-tcg-variants__stat-value">
                          {formatUsd(variant.allTimeHigh)}
                        </span>
                        {variant.allTimeHighDate && (
                          <small className="just-tcg-variants__stat-date">
                            {formatStatisticDate(variant.allTimeHighDate)}
                          </small>
                        )}
                      </span>
                    </td>
                    <td className="just-tcg-variants__low">
                      <span className="just-tcg-variants__stat">
                        <span className="just-tcg-variants__stat-value">
                          {formatUsd(variant.allTimeLow)}
                        </span>
                        {variant.allTimeLowDate && (
                          <small className="just-tcg-variants__stat-date">
                            {formatStatisticDate(variant.allTimeLowDate)}
                          </small>
                        )}
                      </span>
                    </td>
                    <td className="just-tcg-variants__below">
                      {belowAmount === undefined ? (
                        "—"
                      ) : (
                        <>
                          <span>-{formatUsd(belowAmount)}</span>
                          <small>({belowPercent!.toFixed(1)}%)</small>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function JustTcgPriceHistory({
  groups,
}: {
  groups: JustTcgVariantGroup[];
}) {
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
  const selectedVariant =
    selectedGroup?.variants.find(
      (variant) => variant.condition === selectedCondition,
    ) ?? selectedGroup?.variants[0];
  const multipleSets =
    new Set(groups.map((group) => group.setName).filter(Boolean)).size > 1;

  if (!selectedGroup || !selectedVariant) {
    const fallbackGroup = groups[0];
    return (
      <section className="just-tcg-history just-tcg-history--empty">
        <header>
          <CardIdentity
            cardName={fallbackGroup?.cardName}
            cardNumber={fallbackGroup?.cardNumber}
            setName={fallbackGroup?.setName}
          />
        </header>
        <p>Historical pricing is unavailable for this card.</p>
      </section>
    );
  }

  return (
    <section className="just-tcg-history">
      <header>
        <CardIdentity
          cardName={selectedGroup.cardName}
          cardNumber={selectedGroup.cardNumber}
          setName={selectedGroup.setName}
        />
        <div className="just-tcg-history__controls">
          <div>
            <span>Variant</span>
            <SelectDropdown
              ariaLabel="Select price history variant"
              className={`just-tcg-history__variant-select${
                selectedGroup.printing.toLowerCase().includes("reverse")
                  ? " is-reverse"
                  : ""
              }`}
              compact
              leadingIcon={<Layers3 />}
              onChange={(groupId) => {
                setSelectedGroupId(groupId);
                const nextGroup = groups.find((group) => group.id === groupId);
                const firstCondition =
                  nextGroup?.variants.find(
                    (variant) => variant.priceHistory.length >= 2,
                  )?.condition ?? nextGroup?.variants[0]?.condition;
                if (firstCondition) setSelectedCondition(firstCondition);
              }}
              options={groups.map((group) => ({
                label: group.printing,
                ...(multipleSets &&
                  group.setName && { secondaryLabel: group.setName }),
                value: group.id,
              }))}
              value={selectedGroup.id}
            />
          </div>
          <div>
            <span>Condition</span>
            <SelectDropdown
              ariaLabel="Select price history condition"
              className="just-tcg-history__condition-select"
              compact
              onChange={setSelectedCondition}
              options={selectedGroup.variants.map((variant) => ({
                label: variant.condition,
                value: variant.condition,
              }))}
              value={selectedVariant.condition}
            />
          </div>
        </div>
      </header>
      {selectedVariant.priceHistory.length >= 2 ? (
        <PriceHistoryChart variant={selectedVariant} />
      ) : (
        <div className="just-tcg-history__chart-empty" role="status">
          <strong>Historical pricing unavailable</strong>
          <span>
            No price history was returned for {selectedVariant.condition}.
          </span>
        </div>
      )}
      <SelectedVariantPrices group={selectedGroup} />
    </section>
  );
}

function CardIdentity({
  cardName,
  cardNumber,
  setName,
}: {
  cardName?: string;
  cardNumber?: string;
  setName?: string;
}) {
  return (
    <div className="just-tcg-history__card-identity">
      <h3>{cardName ?? "Price history"}</h3>
      {cardNumber && (
        <>
          <i aria-hidden="true">•</i>
          <span className="just-tcg-history__card-number">{cardNumber}</span>
        </>
      )}
      {setName && (
        <>
          <i aria-hidden="true">•</i>
          <span>{setName}</span>
        </>
      )}
    </div>
  );
}

function formatStatisticDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : formatDate(timestamp, true);
}
