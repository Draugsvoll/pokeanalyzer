import biggestMovers from "../../../../data/news/biggestMovers.json";
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

export function BiggestMovers() {
  const payload = biggestMovers as MoversPayload;

  const cards = payload?.cards ?? [];
  const reportLink = payload?.report_link;

  return (
    <section className="biggest-gainers ui-render-fade">
      <header className="biggest-gainers__header">
        <h1 className="biggest-gainers__title">
          Weekly movers from TCG
        </h1>
      </header>

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

    </section>
  );
}
