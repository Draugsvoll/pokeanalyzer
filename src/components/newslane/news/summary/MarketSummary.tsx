import type { CSSProperties, ReactNode } from "react";
import { isScoreNumber } from "../../../../../shared/analysisScores";
import type { MarketSummaryPayload } from "../../../../types/news";
import { FeatureAnalysisHero } from "../../../../pages/pokemonDetails/components/FeatureAnalysisPanel";
import { Badge } from "../../../ui/Badge";
import {
  getNewsAccentStyle,
  getNewsLabelAccent,
  type NewsAccent,
} from "../newsStyles";
import "../NewsCards.scss";
import "./MarketSummary.scss";

type SummaryCardProps = {
  accent: NewsAccent;
  children: ReactNode;
  label?: string;
  title: string;
};

function SummaryCard({
  accent,
  children,
  label = "",
  title,
}: SummaryCardProps) {
  return (
    <article
      className="news-card market-summary__card"
      style={getNewsAccentStyle(accent)}
    >
      <div className="news-card__content">
        <header className="news-card__heading">
          {label && (
            <div className="market-summary__meta">
              <Badge accent={accent} size="sm" weight="strong">
                {label}
              </Badge>
            </div>
          )}
          <div className="market-summary__card-title">
            <h3>{title}</h3>
          </div>
        </header>
        <div className="news-card__body">{children}</div>
      </div>
    </article>
  );
}

type SummaryEntryProps = {
  description: string;
  label?: string;
  title: string;
};

function SummaryEntry({ description, label = "", title }: SummaryEntryProps) {
  const labelAccent = getNewsLabelAccent(label || title);

  return (
    <li className="market-summary__entry">
      <div className="market-summary__entry-content">
        <div className="market-summary__entry-heading">
          <h3>{title}</h3>
          {label && (
            <Badge accent={labelAccent} size="sm" weight="strong">
              {label}
            </Badge>
          )}
        </div>
        {description && <p>{description}</p>}
      </div>
    </li>
  );
}

export function MarketSummary({ payload }: { payload: MarketSummaryPayload }) {
  const keyThemesAndChanges = Array.isArray(payload.keyThemesAndChanges)
    ? payload.keyThemesAndChanges
    : [];
  const liquidity = Array.isArray(payload.liquidity) ? payload.liquidity : [];
  const marketDrivers = Array.isArray(payload.marketDrivers)
    ? payload.marketDrivers
    : [];
  const segmentSummary = Array.isArray(payload.segmentSummary)
    ? payload.segmentSummary
    : [];
  const whatToWatch = Array.isArray(payload.whatToWatch)
    ? payload.whatToWatch
    : [];
  const marketTone = payload.marketTone;
  const collectorOutlook = payload.collectorOutlook;
  const marketScore = isScoreNumber(payload.marketScore)
    ? payload.marketScore
    : null;
  const toneAccent = getNewsLabelAccent(marketTone?.label || "market");
  const hasLeadContent = Boolean(
    marketScore != null ||
    marketTone?.headline ||
    marketTone?.label ||
    collectorOutlook?.outlook ||
    collectorOutlook?.label,
  );

  return (
    <section className="market-summary news-collection">
      <div className="news-card-grid market-summary__grid">
        {hasLeadContent && (
          <div
            className="market-summary__hero"
            style={
              {
                "--feature-accent": `var(--custom-color-${toneAccent})`,
              } as CSSProperties
            }
          >
            <FeatureAnalysisHero
              badge={
                marketTone?.label ? (
                  <Badge accent={toneAccent} size="lg" weight="strong">
                    {`${marketTone.label} Sentiment`}
                  </Badge>
                ) : undefined
              }
              eyebrow={marketScore != null ? "Market health" : undefined}
              headline={marketTone?.headline || "Weekly Market Report"}
              score={marketScore}
              scoreLabel="Market health score"
            >
              {collectorOutlook?.outlook && (
                <p className="feature-analysis-summary feature-analysis-summary-text">
                  {collectorOutlook.outlook}
                </p>
              )}
            </FeatureAnalysisHero>
          </div>
        )}

        {!!keyThemesAndChanges.length && (
          <SummaryCard accent="purple" title="Highlights">
            <ul className="news-card__list market-summary__entries">
              {keyThemesAndChanges.map((item, index) => (
                <SummaryEntry
                  description={item.theme}
                  key={`theme-${item.title}-${index}`}
                  title={item.title || "Market theme"}
                />
              ))}
            </ul>
          </SummaryCard>
        )}

        {!!segmentSummary.length && (
          <SummaryCard accent="blue" title="General movements">
            <ul className="news-card__list market-summary__entries">
              {segmentSummary.map((item, index) => (
                <SummaryEntry
                  description={item.description}
                  key={`segment-${item.title}-${index}`}
                  label={item.trend}
                  title={item.title || "Market segment"}
                />
              ))}
            </ul>
          </SummaryCard>
        )}

        {!!marketDrivers.length && (
          <SummaryCard accent="orange" title="Market drivers">
            <ul className="news-card__list market-summary__entries">
              {marketDrivers.map((item, index) => (
                <SummaryEntry
                  description={item.description}
                  key={`driver-${item.title}-${index}`}
                  title={item.title || "Market driver"}
                />
              ))}
            </ul>
          </SummaryCard>
        )}

        {!!liquidity.length && (
          <SummaryCard accent="yellow" title="Liquidity">
            <ul className="news-card__list market-summary__entries">
              {liquidity.map((item, index) => (
                <SummaryEntry
                  description={item.description}
                  key={`liquidity-${item.title}-${index}`}
                  label={item.label}
                  title={item.title || "Market liquidity"}
                />
              ))}
            </ul>
          </SummaryCard>
        )}

        {!!whatToWatch.length && (
          <SummaryCard accent="teal" title="What to watch">
            <ul className="news-card__list market-summary__entries">
              {whatToWatch.map((item, index) => (
                <SummaryEntry
                  description={item.description}
                  key={`watch-${item.title}-${index}`}
                  title={item.title || "What to watch"}
                />
              ))}
            </ul>
          </SummaryCard>
        )}
      </div>
    </section>
  );
}
