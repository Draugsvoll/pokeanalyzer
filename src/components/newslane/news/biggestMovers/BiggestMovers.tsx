import { useMemo, useState } from "react";
import Button from "../../../button/Button";
import { askGrok } from "../../../../utils/grok/grokClient";
import { getBiggestMovers } from "../../../../utils/grok/grokPrompts";
import "./BiggestMovers.scss";

type Mover = {
  rank?: number;
  card_name?: string;
  set_name?: string | null;
  card_number?: number | string | null;
  open_price?: number;
  last_price?: number;
  price_change_dollar?: number;
  price_change_percent?: number;
  reason?: string | null;
  source_name?: string;
  source_title?: string;
  source_url?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  const text = asString(value);
  return text || undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[%$,+\s]/g, "").trim();
    if (!cleaned) return undefined;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asCardNumber(value: unknown): number | string | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = asString(value);
  if (!text) return undefined;
  const asNum = Number(text);
  return Number.isFinite(asNum) && String(asNum) === text ? asNum : text;
}

function parseMovers(response: string): Mover[] | null {
  try {
    const cleaned = response.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
    const parsed: unknown = JSON.parse(cleaned);

    const rawList = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.items)
        ? parsed.items
        : isRecord(parsed) && Array.isArray(parsed.top_gainers)
          ? parsed.top_gainers
          : null;

    if (!rawList) return null;

    const movers = rawList
      .map((item): Mover | null => {
        if (!isRecord(item)) return null;

        const open_price =
          asFiniteNumber(item.open_price) ??
          asFiniteNumber(item.starting_price);
        const last_price =
          asFiniteNumber(item.last_price) ??
          asFiniteNumber(item.current_price);

        let price_change_dollar = asFiniteNumber(item.price_change_dollar);
        if (price_change_dollar === undefined) {
          price_change_dollar = asFiniteNumber(item.change);
        }
        if (
          price_change_dollar === undefined &&
          open_price !== undefined &&
          last_price !== undefined
        ) {
          price_change_dollar = last_price - open_price;
        }

        let price_change_percent = asFiniteNumber(item.price_change_percent);
        if (
          price_change_percent === undefined &&
          open_price !== undefined &&
          open_price !== 0 &&
          last_price !== undefined
        ) {
          price_change_percent = ((last_price - open_price) / open_price) * 100;
        }

        const mover: Mover = {
          rank:
            typeof item.rank === "number" && Number.isFinite(item.rank)
              ? item.rank
              : asFiniteNumber(item.rank),
          card_name: asString(item.card_name) || asString(item.card) || undefined,
          set_name:
            item.set_name === null
              ? null
              : asNullableString(item.set_name) ??
                asNullableString(item.set),
          card_number: asCardNumber(item.card_number),
          open_price,
          last_price,
          price_change_dollar,
          price_change_percent,
          reason:
            item.reason === null
              ? null
              : asString(item.reason) || asString(item.notes) || undefined,
          source_name: asString(item.source_name) || undefined,
          source_title: asString(item.source_title) || undefined,
          source_url: asString(item.source_url) || undefined,
        };

        const hasContent = Boolean(
          mover.rank !== undefined ||
            mover.card_name ||
            mover.set_name ||
            (mover.card_number !== undefined && mover.card_number !== null) ||
            mover.open_price !== undefined ||
            mover.last_price !== undefined ||
            mover.price_change_dollar !== undefined ||
            mover.price_change_percent !== undefined ||
            mover.reason ||
            mover.source_name ||
            mover.source_title ||
            mover.source_url,
        );

        return hasContent ? mover : null;
      })
      .filter((item): item is Mover => item !== null);

    return movers.length > 0 ? movers : null;
  } catch {
    return null;
  }
}

function formatMoney(value: number): string {
  const absolute = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (value > 0) return `+$${absolute}`;
  if (value < 0) return `-$${absolute}`;
  return `$${absolute}`;
}

function formatLevelPrice(value: number): string {
  return `$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number): string {
  const absolute = Math.abs(value).toLocaleString("en-US", {
    maximumFractionDigits: 1,
  });
  return `${absolute}%`;
}

function isNegativeChange(value: number | undefined): boolean {
  return typeof value === "number" && value < 0;
}

function formatPrettyJson(response: string): string {
  try {
    return JSON.stringify(
      JSON.parse(response.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim()),
      null,
      2,
    );
  } catch {
    return response;
  }
}

function titleMeta(item: Mover): string {
  const parts = [
    item.set_name ?? "",
    item.card_number !== undefined && item.card_number !== null
      ? String(item.card_number)
      : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

// TEMP: remove after layout verification
const TEMP_TEST_MOVERS: Mover[] = [
  {
    rank: 1,
    card_name: "Pikachu & Zekrom-GX",
    set_name: "Team Up",
    card_number: null,
    open_price: 40.82,
    last_price: 99.49,
    price_change_dollar: 58.67,
    price_change_percent: 143.7,
    reason:
      "Demand increased following recent Pokémon TCG announcements.",
    source_name: "TCGplayer",
    source_title: "Biggest Price Spikes",
    source_url: "https://...",
  },
  {
    rank: 2,
    card_name: "Charizard VMAX",
    set_name: "Darkness Ablaze",
    card_number: null,
    open_price: 72.5,
    last_price: 41.2,
    price_change_dollar: -31.3,
    price_change_percent: -43.2,
    reason:
      "Supply increased after a large collection entered the market, cooling recent demand.",
    source_name: "TCGplayer",
    source_title: "Biggest Price Spikes",
    source_url: "https://...",
  },
];

export function BiggestMovers() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState("");

  const generateBiggestMovers = async () => {
    if (loading) return;

    setLoading(true);
    setError("");
    setResponse("");

    const result = await askGrok(getBiggestMovers, "market_news");

    if (result.ok) setResponse(result.text);
    else setError(result.error);

    setLoading(false);
  };

  const movers = useMemo(() => {
    if (response) return parseMovers(response);
    // TEMP: seed one card for layout testing without calling Grok
    return TEMP_TEST_MOVERS;
  }, [response]);

  return (
    <section className="biggest-gainers">
      <header className="biggest-gainers__header">
        <Button disabled={loading} onClick={generateBiggestMovers}>
          {loading ? "Generating..." : "Get biggest movers"}
        </Button>
      </header>

      {error && <p className="biggest-gainers__error">{error}</p>}
      {response && !movers && (
        <div className="biggest-gainers__raw">{response}</div>
      )}

      {!!movers?.length && (
        <div className="biggest-gainers__list">
          {movers.map((item, index) => {
            const negative =
              isNegativeChange(item.price_change_dollar) ||
              isNegativeChange(item.price_change_percent);
            const rankLabel =
              item.rank !== undefined ? item.rank : index + 1;
            const meta = titleMeta(item);
            const hasMetrics =
              item.price_change_percent !== undefined ||
              item.price_change_dollar !== undefined ||
              item.open_price !== undefined ||
              item.last_price !== undefined;

            const hasTitle = Boolean(item.card_name || meta);

            return (
              <article
                className={`biggest-gainers__card${
                  negative ? " biggest-gainers__card--loss" : ""
                }`}
                key={`${item.rank ?? index}-${item.card_name ?? "card"}-${item.set_name ?? ""}`}
              >
                <div className="biggest-gainers__body">
                  {hasMetrics && (
                    <div className="biggest-gainers__metrics">
                      <div
                        className="biggest-gainers__metrics-row"
                        aria-label={
                          item.price_change_percent !== undefined
                            ? `${negative ? "Down" : "Up"} ${formatPercent(item.price_change_percent)}`
                            : undefined
                        }
                      >
                        <span
                          className="biggest-gainers__trend-icon"
                          aria-hidden="true"
                        >
                          {item.price_change_percent !== undefined ||
                          item.price_change_dollar !== undefined
                            ? negative
                              ? "▼"
                              : "▲"
                            : ""}
                        </span>

                        <div className="biggest-gainers__figures">
                          {item.price_change_percent !== undefined && (
                            <strong className="biggest-gainers__percent">
                              {formatPercent(item.price_change_percent)}
                            </strong>
                          )}

                          {item.price_change_dollar !== undefined && (
                            <div className="biggest-gainers__dollar">
                              {formatMoney(item.price_change_dollar)}
                            </div>
                          )}

                          {(item.open_price !== undefined ||
                            item.last_price !== undefined) && (
                            <div className="biggest-gainers__levels">
                              {item.open_price !== undefined && (
                                <div className="biggest-gainers__level">
                                  <span className="biggest-gainers__level-label">
                                    Open
                                  </span>
                                  <span className="biggest-gainers__level-value">
                                    {formatLevelPrice(item.open_price)}
                                  </span>
                                </div>
                              )}

                              {item.open_price !== undefined &&
                                item.last_price !== undefined && (
                                  <span
                                    className="biggest-gainers__level-arrow"
                                    aria-hidden="true"
                                  >
                                    →
                                  </span>
                                )}

                              {item.last_price !== undefined && (
                                <div className="biggest-gainers__level">
                                  <span className="biggest-gainers__level-label">
                                    Last
                                  </span>
                                  <span className="biggest-gainers__level-value">
                                    {formatLevelPrice(item.last_price)}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="biggest-gainers__why">
                    <div className="biggest-gainers__why-header">
                      <div className="biggest-gainers__title-row">
                        {item.card_name && (
                          <h2 className="biggest-gainers__name">
                            {item.card_name}
                            {meta ? (
                              <span className="biggest-gainers__meta">
                                {" "}
                                · {meta}
                              </span>
                            ) : null}
                          </h2>
                        )}
                        {!item.card_name && meta && (
                          <h2 className="biggest-gainers__name">
                            <span className="biggest-gainers__meta">{meta}</span>
                          </h2>
                        )}
                      </div>
                      <div
                        className="biggest-gainers__rank"
                        aria-label={`Rank ${rankLabel}`}
                      >
                        #{rankLabel}
                      </div>
                    </div>

                    {item.reason && (
                      <>
                        <h3 className="biggest-gainers__why-label">
                          Why it moved
                        </h3>
                        <p className="biggest-gainers__why-text">{item.reason}</p>
                      </>
                    )}

                    {!hasTitle && !item.reason && (
                      <p className="biggest-gainers__why-text">—</p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {response && (
        <pre className="biggest-gainers__raw-json">
          {formatPrettyJson(response)}
        </pre>
      )}
    </section>
  );
}
