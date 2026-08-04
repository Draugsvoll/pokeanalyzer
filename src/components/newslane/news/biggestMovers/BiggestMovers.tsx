import type React from "react";
import type { BiggestMoversPayload } from "../../../../types/news";
import "./BiggestMovers.scss";

type BiggestMoversProps = {
  payload: BiggestMoversPayload;
};

const PRICE_PATTERN =
  /(?:[$€£]\s?\d[\d,]*(?:\.\d{1,2})?(?:\s?(?:-|to|and)\s?[$€£]?\s?\d[\d,]*(?:\.\d{1,2})?)?|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:USD|EUR|GBP)\b)/gi;

function renderHighlightedPrices(text: string) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(PRICE_PATTERN)) {
    const value = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }

    parts.push(
      <strong className="biggest-gainers__price" key={`${value}-${index}`}>
        {value}
      </strong>,
    );
    lastIndex = index + value.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? parts : text;
}

export function BiggestMovers({ payload }: BiggestMoversProps) {
  const cards = payload.cards;
  const reportLink = payload.report_link;

  return (
    <section className="biggest-gainers ui-render-fade">
      {!!cards.length && (
        <div className="biggest-gainers__list">
          {cards.map((item, index) => {
            const hasContent = Boolean(
              item.rank || item.card_name || item.summary,
            );

            return (
              <article
                className="biggest-gainers__card"
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
                      <p className="biggest-gainers__summary">
                        {renderHighlightedPrices(item.summary)}
                      </p>
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
    </section>
  );
}
