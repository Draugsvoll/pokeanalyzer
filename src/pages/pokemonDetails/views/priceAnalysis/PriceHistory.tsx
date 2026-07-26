import { useEffect, useState } from "react";
import { LoadingState } from "../../../../components/loadingState/LoadingState";
import {
  fetchCardPriceHistory,
  type CardPriceHistoryResponse,
  type CardPriceHistorySnapshot,
} from "../../../../services/cardApi";
import { logClientError } from "../../../../utils/logClientError";
import "./PriceHistory.scss";

const HISTORY_DAYS = 7;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

type PriceSource = "tcgplayerPrices" | "cardmarketPrices";

type PriceSeries = {
  field: string;
  label: string;
};

const TCGPLAYER_SERIES: PriceSeries[] = [
  { field: "normal", label: "Normal market" },
  { field: "holofoil", label: "Holofoil market" },
  { field: "reverseHolofoil", label: "Reverse Holo market" },
  { field: "firstEditionHolofoil", label: "1st Ed. Holo market" },
  { field: "firstEditionNormal", label: "1st Ed. Normal market" },
];

const CARDMARKET_SERIES: PriceSeries[] = [
  { field: "trendPrice", label: "Trend price" },
  { field: "reverseHoloTrend", label: "Reverse Holo trend" },
];

const snapshotDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

function parseSnapshotDate(value: string) {
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatSnapshotDate(value: string) {
  const date = parseSnapshotDate(value);
  return date ? snapshotDateFormatter.format(date) : value;
}

function getSeriesValue(
  snapshot: CardPriceHistorySnapshot,
  source: PriceSource,
  field: string,
) {
  const prices = snapshot[source];
  if (!prices) return null;

  const price = (prices as unknown as Record<string, unknown>)[field];
  if (source === "tcgplayerPrices") {
    if (!price || typeof price !== "object" || Array.isArray(price)) return null;
    const market = (price as Record<string, unknown>).market;
    return typeof market === "number" && Number.isFinite(market) ? market : null;
  }

  return typeof price === "number" && Number.isFinite(price) ? price : null;
}

function formatPrice(value: number, currency: "USD" | "EUR") {
  return new Intl.NumberFormat("en-US", {
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function hasDateGaps(snapshots: CardPriceHistorySnapshot[]) {
  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = parseSnapshotDate(snapshots[index - 1].recordedAt);
    const current = parseSnapshotDate(snapshots[index].recordedAt);
    if (previous && current && current.getTime() - previous.getTime() > DAY_IN_MS) {
      return true;
    }
  }
  return false;
}

function getAvailabilityMessage(history: CardPriceHistoryResponse) {
  const count = history.snapshots.length;
  if (count === 0) {
    return "No daily price snapshots have been recorded for this card yet.";
  }

  const amount =
    count < history.days
      ? `Only ${count} of ${history.days} requested daily snapshots are available.`
      : `${count} daily snapshots are available.`;
  const gap = hasDateGaps(history.snapshots)
    ? " Some calendar dates are missing and remain gaps."
    : "";
  const comparison =
    count === 1
      ? " At least two snapshots are needed to calculate a change."
      : "";
  return `${amount}${gap}${comparison}`;
}

function getSeriesChange(
  snapshots: CardPriceHistorySnapshot[],
  source: PriceSource,
  field: string,
) {
  const points = snapshots.flatMap((snapshot) => {
    const value = getSeriesValue(snapshot, source, field);
    return value === null ? [] : [{ date: snapshot.recordedAt, value }];
  });

  if (points.length < 2) return null;

  const first = points[0];
  const last = points.at(-1)!;
  const amount = last.value - first.value;
  const percent = first.value === 0 ? null : (amount / first.value) * 100;
  return {
    amount,
    firstDate: first.date,
    lastDate: last.date,
    percent,
    tone: amount > 0 ? "up" : amount < 0 ? "down" : "flat",
  } as const;
}

function formatChangeAmount(value: number, currency: "USD" | "EUR") {
  if (value === 0) return formatPrice(0, currency);
  const sign = value > 0 ? "+" : "−";
  return `${sign}${formatPrice(Math.abs(value), currency)}`;
}

function SourceHistoryTable({
  accent,
  currency,
  series,
  snapshots,
  source,
  title,
}: {
  accent: "tcgplayer" | "cardmarket";
  currency: "USD" | "EUR";
  series: PriceSeries[];
  snapshots: CardPriceHistorySnapshot[];
  source: PriceSource;
  title: string;
}) {
  const visibleSeries = series.filter((item) =>
    snapshots.some(
      (snapshot) => getSeriesValue(snapshot, source, item.field) !== null,
    ),
  );

  return (
    <article className={`price-history__source price-history__source--${accent}`}>
      <header className="price-history__source-header">
        <div>
          <h3>{title}</h3>
          <span>{currency}</span>
        </div>
        <small>Recorded by your daily sync</small>
      </header>

      {visibleSeries.length === 0 ? (
        <p className="price-history__source-empty">
          No {title} values are available in these snapshots.
        </p>
      ) : (
        <div className="price-history__table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Recorded</th>
                {visibleSeries.map((item) => (
                  <th scope="col" key={item.field}>{item.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snapshot) => (
                <tr key={snapshot.recordedAt}>
                  <th scope="row">{formatSnapshotDate(snapshot.recordedAt)}</th>
                  {visibleSeries.map((item) => {
                    const value = getSeriesValue(snapshot, source, item.field);
                    return (
                      <td key={item.field}>
                        {value === null ? (
                          <span className="price-history__missing">—</span>
                        ) : (
                          formatPrice(value, currency)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Stored-period change</th>
                {visibleSeries.map((item) => {
                  const change = getSeriesChange(
                    snapshots,
                    source,
                    item.field,
                  );
                  return (
                    <td key={item.field}>
                      {change ? (
                        <span
                          className={`price-history__change price-history__change--${change.tone}`}
                        >
                          <strong>
                            {formatChangeAmount(change.amount, currency)}
                            {change.percent !== null && (
                              <> ({change.percent > 0 ? "+" : ""}{change.percent.toFixed(1)}%)</>
                            )}
                          </strong>
                          <small>
                            {formatSnapshotDate(change.firstDate)} →{" "}
                            {formatSnapshotDate(change.lastDate)}
                          </small>
                        </span>
                      ) : (
                        <span className="price-history__insufficient">
                          Need 2 prices
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </article>
  );
}

export function PriceHistory({ cardId }: { cardId: string }) {
  const [requestState, setRequestState] = useState<{
    cardId: string;
    error: string;
    history: CardPriceHistoryResponse | null;
    loading: boolean;
  }>(() => ({
    cardId,
    error: "",
    history: null,
    loading: true,
  }));
  const requestMatchesCard = requestState.cardId === cardId;
  const history = requestMatchesCard ? requestState.history : null;
  const loading = requestMatchesCard ? requestState.loading : true;
  const error = requestMatchesCard ? requestState.error : "";

  useEffect(() => {
    const controller = new AbortController();

    fetchCardPriceHistory(cardId, HISTORY_DAYS, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) {
          setRequestState({
            cardId,
            error: "",
            history: response,
            loading: false,
          });
        }
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        logClientError("Failed to load card price history", requestError);
        setRequestState({
          cardId,
          error: "Price history is unavailable right now.",
          history: null,
          loading: false,
        });
      });

    return () => controller.abort();
  }, [cardId]);

  return (
    <section className="price-history ui-render-fade" aria-labelledby="price-history-title">
      <header className="price-history__header">
        <div>
          <h2 className="app-subheader" id="price-history-title">
            7-day price history
          </h2>
          <p>
            TCGplayer values stay in USD and Cardmarket values stay in EUR.
            Changes compare only the same price field.
          </p>
        </div>
      </header>

      {loading && <LoadingState>Loading daily price history...</LoadingState>}

      {!loading && error && (
        <p className="price-history__message price-history__message--error" role="status">
          {error} Current prices above are unaffected.
        </p>
      )}

      {!loading && history && (
        <>
          <p className="price-history__message" role="status">
            {getAvailabilityMessage(history)}
          </p>
          {history.snapshots.length > 0 && (
            <div className="price-history__sources">
              <SourceHistoryTable
                accent="tcgplayer"
                currency="USD"
                series={TCGPLAYER_SERIES}
                snapshots={history.snapshots}
                source="tcgplayerPrices"
                title="TCGplayer market history"
              />
              <SourceHistoryTable
                accent="cardmarket"
                currency="EUR"
                series={CARDMARKET_SERIES}
                snapshots={history.snapshots}
                source="cardmarketPrices"
                title="Cardmarket trend history"
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
