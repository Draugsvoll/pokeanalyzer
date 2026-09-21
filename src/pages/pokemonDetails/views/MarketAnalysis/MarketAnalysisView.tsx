import { parseMarketAnalysisResponse } from "../../../../../shared/marketAnalysis";
import { Layers3, TrendingUp, TriangleAlert } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
import {
  FeatureAnalysisHero,
  FeatureAnalysisScoreMeter,
} from "../../components/FeatureAnalysisPanel";
import { CardFeatureHeaderVariants } from "../../components/CardFeatureHeader";
import { GrokLoadingState } from "../../components/GrokLoadingState";
import { FEATURE_ERROR_MESSAGE } from "../featureError";
import "./MarketAnalysisView.scss";

function displayLabel(value: string) {
  return value.replaceAll("_", " ");
}

function displayLabelCapitalized(value: string) {
  const label = displayLabel(value);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function outlookAccent(label: string) {
  if (label.includes("negative")) return "red" as const;
  if (label.includes("positive")) return "green" as const;
  return "yellow" as const;
}

function balanceAccent(balance: string) {
  if (balance === "balanced") return "green" as const;
  if (balance === "unclear") return "yellow" as const;
  return "orange" as const;
}

function priceDiscoveryAccent(label: string) {
  if (label === "strong") return "green" as const;
  if (label === "weak") return "red" as const;
  if (label === "unclear") return "yellow" as const;
  return "blue" as const;
}

function TextList({ items }: { items: string[] }) {
  if (items.length === 0) return <span>None identified</span>;

  return (
    <ul>
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

export function MarketAnalysisView({
  grokRequest,
}: {
  grokRequest: GrokRequestState;
}) {
  const { error, loading, response } = grokRequest;

  if (loading)
    return <GrokLoadingState>Building market report...</GrokLoadingState>;
  if (error)
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  if (!response) return null;

  const data = parseMarketAnalysisResponse(response);
  if (!data) {
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  }

  return (
    <section className="market-analysis-report ui-render-fade">
      <div className="market-analysis-report__hero-group">
        <CardFeatureHeaderVariants>
          <fieldset
            aria-label="Market analysis variant"
            className="market-analysis-report__variant-selector radio-group variant-badge-group"
          >
            <div>
              <label>
                <input
                  checked
                  name="market-analysis-variant"
                  readOnly
                  type="radio"
                />
                <span>
                  <Layers3 aria-hidden="true" />
                  <strong>{data.variantName}</strong>
                </span>
              </label>
            </div>
          </fieldset>
        </CardFeatureHeaderVariants>

        <FeatureAnalysisHero
          headline={data.headline}
          score={data.score}
          scoreLabel="Market health score"
        >
          <div className="market-analysis-report__overview-content">
            <div className="market-analysis-report__signals">
              {data.signals.map((signal) => (
                <section
                  className="default-container-inner default-container-inner--centered"
                  key={signal.title}
                >
                  <header className="market-analysis-report__signal-heading">
                    <FeatureAnalysisScoreMeter
                      label={`${signal.title} score`}
                      score={signal.score}
                      showMaximum={false}
                      size="icon"
                    />
                    <h4>{signal.title}</h4>
                  </header>
                  <p className="market-analysis-report__signal-explanation">
                    {signal.explanation}
                  </p>
                </section>
              ))}
            </div>
          </div>
        </FeatureAnalysisHero>
      </div>

      <div className="market-analysis-report__details default-container">
        <section className="market-analysis-report__summary-section">
          <h2>Summary</h2>
        </section>

        <div className="market-analysis-report__summary-grid">
          <article className="default-container-inner default-container-inner--centered">
            <header className="market-analysis-report__summary-heading">
              <h4>Healthiest segment</h4>
              <Badge accent="orange" weight="strong">
                {data.healthiestSegment.label}
              </Badge>
            </header>
            <p>{data.healthiestSegment.explanation}</p>
          </article>
          <article className="default-container-inner default-container-inner--centered">
            <header className="market-analysis-report__summary-heading">
              <h4>Market balance</h4>
              <Badge
                accent={balanceAccent(data.marketBalance.label)}
                weight="strong"
              >
                {displayLabelCapitalized(data.marketBalance.label)}
              </Badge>
            </header>
            <p>{data.marketBalance.explanation}</p>
          </article>
          <article className="default-container-inner default-container-inner--centered">
            <header className="market-analysis-report__summary-heading">
              <h4>Price discovery</h4>
              <Badge
                accent={priceDiscoveryAccent(data.priceDiscovery.label)}
                weight="strong"
              >
                {displayLabelCapitalized(data.priceDiscovery.label)}
              </Badge>
            </header>
            <p>{data.priceDiscovery.explanation}</p>
          </article>
          {data.eyesOn && (
            <article className="market-analysis-report__eyes-on default-container-inner default-container-inner--centered">
              <header className="market-analysis-report__summary-heading">
                <h4>What to look for</h4>
                <Badge accent="yellow" weight="strong">
                  {data.eyesOn.label}
                </Badge>
              </header>
              <p>{data.eyesOn.explanation}</p>
            </article>
          )}
        </div>
      </div>

      <article className="market-analysis-report__outlook default-container">
        <h2>Outlook</h2>
        <div className="market-analysis-report__outlook-grid">
          <section className="default-container-inner default-container-inner--centered">
            <header className="market-analysis-report__summary-heading">
              <h4>Near term</h4>
              <Badge
                accent={outlookAccent(data.outlook.nearTerm.label)}
                weight="strong"
              >
                {displayLabelCapitalized(data.outlook.nearTerm.label)}
              </Badge>
            </header>
            <p>{data.outlook.nearTerm.explanation}</p>
          </section>
          <section className="default-container-inner default-container-inner--centered">
            <header className="market-analysis-report__summary-heading">
              <h4>Long term</h4>
              <Badge
                accent={outlookAccent(data.outlook.longTerm.label)}
                weight="strong"
              >
                {displayLabelCapitalized(data.outlook.longTerm.label)}
              </Badge>
            </header>
            <p>{data.outlook.longTerm.explanation}</p>
          </section>
          <section className="market-analysis-report__outlook-list--upside default-container-inner default-container-inner--centered">
            <h4 className="market-analysis-report__outlook-title market-analysis-report__outlook-title--upside">
              <TrendingUp aria-hidden="true" size={17} strokeWidth={2} />
              Upside drivers
            </h4>
            <TextList items={data.outlook.upsideDrivers} />
          </section>
          <section className="market-analysis-report__outlook-list--risks default-container-inner default-container-inner--centered">
            <h4 className="market-analysis-report__outlook-title market-analysis-report__outlook-title--risks">
              <TriangleAlert aria-hidden="true" size={17} strokeWidth={2} />
              Risks
            </h4>
            <TextList items={data.outlook.risks} />
          </section>
        </div>
      </article>
    </section>
  );
}
