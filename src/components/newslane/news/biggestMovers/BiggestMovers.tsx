import { useMemo, useState } from "react";
import Button from "../../../button/Button";
import { askGrok } from "../../../../utils/grok/grokClient";
import { getBiggestMovers } from "../../../../utils/grok/grokPrompts";
import "./BiggestMovers.scss";

type Mover = {
  rank?: string;
  card_name?: string;
  summary?: string;
};

type MoversPayload = {
  report_link?: string;
  cards: Mover[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function parseMover(item: unknown): Mover | null {
  if (!isRecord(item)) return null;

  const mover: Mover = {
    rank: asString(item.rank) || undefined,
    card_name: asString(item.card_name) || asString(item.card) || undefined,
    summary:
      asString(item.summary) ||
      asString(item.reason) ||
      asString(item.notes) ||
      undefined,
  };

  return mover.rank || mover.card_name || mover.summary ? mover : null;
}

function parseMoversPayload(response: string): MoversPayload | null {
  try {
    const cleaned = response.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
    const parsed: unknown = JSON.parse(cleaned);

    // Preferred: { report_link, cards: [...] }
    if (isRecord(parsed) && Array.isArray(parsed.cards)) {
      const cards = parsed.cards
        .map(parseMover)
        .filter((item): item is Mover => item !== null);

      if (!cards.length && !asString(parsed.report_link)) return null;

      return {
        report_link: asString(parsed.report_link) || undefined,
        cards,
      };
    }

    // Fallbacks for older shapes
    const rawList = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.items)
        ? parsed.items
        : isRecord(parsed) && (parsed.card_name || parsed.summary || parsed.rank)
          ? [parsed]
          : null;

    if (!rawList) return null;

    const cards = rawList
      .map(parseMover)
      .filter((item): item is Mover => item !== null);

    return cards.length > 0 ? { cards } : null;
  } catch {
    return null;
  }
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

  const payload = useMemo(
    () => (response ? parseMoversPayload(response) : null),
    [response],
  );

  const cards = payload?.cards ?? [];
  const reportLink = payload?.report_link;

  return (
    <section className="biggest-gainers">
      <header className="biggest-gainers__header">
        <Button disabled={loading} onClick={generateBiggestMovers}>
          {loading ? "Generating..." : "Get biggest movers"}
        </Button>
      </header>

      {error && <p className="biggest-gainers__error">{error}</p>}
      {response && !payload && (
        <div className="biggest-gainers__raw">{response}</div>
      )}

      {!!cards.length && (
        <div className="biggest-gainers__list">
          {cards.map((item, index) => {
            const hasContent = Boolean(
              item.rank || item.card_name || item.summary,
            );

            return (
              <article
                className="biggest-gainers__card card-hover"
                key={`${index}-${item.rank ?? ""}-${item.card_name ?? "card"}`}
              >
                <div className="biggest-gainers__body">
                  <div className="biggest-gainers__content">
                    <div className="biggest-gainers__heading">
                      {item.card_name && (
                        <h2 className="biggest-gainers__name">
                          {item.card_name}
                        </h2>
                      )}
                      {item.rank && (
                        <span className="biggest-gainers__rank">
                          #{item.rank}
                        </span>
                      )}
                    </div>

                    {item.summary && (
                      <p className="biggest-gainers__summary">{item.summary}</p>
                    )}
                    {!hasContent && (
                      <p className="biggest-gainers__summary">—</p>
                    )}

                    {reportLink && (
                      <a
                        className="biggest-gainers__link"
                        href={reportLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Read source
                      </a>
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
