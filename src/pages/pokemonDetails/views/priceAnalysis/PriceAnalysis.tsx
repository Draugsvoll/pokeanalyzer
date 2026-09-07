import { ChartLine, ExternalLink, Globe2, Search } from "lucide-react";
import { LoadingState } from "../../../../components/loadingState/LoadingState";
import type { PokemonCard } from "../../../../types/pokemon";
import { formatDateStamp } from "../../../../utils/formatDateStamp";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
import { parseJsonText } from "../../../../utils/parseJsonText";
import { FEATURE_ERROR_MESSAGE } from "../featureError";
import { SalesDataView } from "../SalesData/SalesDataView";
import { JustTcgVariants } from "./JustTcgVariants/JustTcgVariants";
import { StoredPrices } from "./StoredPrices";
import "./PriceAnalysis.scss";

type PriceAnalysisProps = {
  card: PokemonCard;
  grokRequest: GrokRequestState;
  salesDataRequest: GrokRequestState;
  justTcgRequest: {
    loading: boolean;
    error: string;
    response: unknown;
  };
  reportLoading?: boolean;
  reportAvailable?: boolean;
};

type JsonRecord = Record<string, unknown>;
type PriceSourceName = "cardmarket" | "pokedata" | "pokeinvest";

type PriceFieldDefinition = {
  currency?: "EUR" | "USD";
  label: string;
  path: string[];
};

const SOURCE_DETAILS: Record<
  PriceSourceName,
  {
    fields: PriceFieldDefinition[];
    icon: typeof Globe2 | string;
    label: string;
    tone: string;
  }
> = {
  cardmarket: {
    fields: [
      { currency: "EUR", label: "From", path: ["from_eur"] },
      {
        currency: "EUR",
        label: "Price trend",
        path: ["price_trend_eur"],
      },
    ],
    icon: "€",
    label: "Cardmarket",
    tone: "green",
  },
  pokedata: {
    fields: [
      { currency: "USD", label: "PSA 7", path: ["psa_ebay_usd", "psa_7"] },
      { currency: "USD", label: "PSA 10", path: ["psa_ebay_usd", "psa_10"] },
    ],
    icon: Search,
    label: "Pokedata",
    tone: "blue",
  },
  pokeinvest: {
    fields: [
      { currency: "USD", label: "Raw", path: ["raw_usd"] },
      { currency: "USD", label: "PSA 10", path: ["psa_10_usd"] },
      { currency: "USD", label: "BGS 10", path: ["bgs_10_usd"] },
    ],
    icon: ChartLine,
    label: "PokeInvest",
    tone: "violet",
  },
};

function PriceSourceIcon({ icon }: { icon: typeof Globe2 | string }) {
  if (typeof icon === "string") return icon;

  const Icon = icon;
  return <Icon aria-hidden="true" />;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function externalUrl(value: unknown) {
  const candidate = text(value);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatAmount(amount: number, currency: string | null): string {
  if (!currency) return amount.toLocaleString();

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency}`;
  }
}

function isPriceSourceName(value: string): value is PriceSourceName {
  return value in SOURCE_DETAILS;
}

function readPath(value: JsonRecord, path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return number(current);
}

function getVariantFields(source: PriceSourceName, variant: JsonRecord) {
  return SOURCE_DETAILS[source].fields.flatMap((definition) => {
    const value = readPath(variant, definition.path);
    return value === null ? [] : [{ definition, value }];
  });
}

function PriceField({
  definition,
  value,
}: {
  definition: PriceFieldDefinition;
  value: number;
}) {
  const displayValue = formatAmount(value, definition.currency ?? null);

  return (
    <div className="grok-price-analysis__price">
      <span>{definition.label}</span>
      <strong>{displayValue}</strong>
    </div>
  );
}

function VariantPrices({
  source,
  variant,
}: {
  source: PriceSourceName;
  variant: JsonRecord;
}) {
  const fields = getVariantFields(source, variant);

  if (fields.length === 0) return null;

  return (
    <div className="grok-price-analysis__prices">
      {fields.map(({ definition, value }) => (
        <PriceField
          definition={definition}
          key={definition.path.join(".")}
          value={value}
        />
      ))}
    </div>
  );
}

function PriceVariant({
  source,
  variant,
}: {
  source: PriceSourceName;
  variant: JsonRecord;
}) {
  const sourceUrl = externalUrl(variant.url);

  return (
    <article className="grok-price-analysis__variant default-container-inner">
      <h4>{text(variant.variant_name)}</h4>
      <div className="grok-price-analysis__variant-content">
        <VariantPrices source={source} variant={variant} />
        {sourceUrl && (
          <a
            className="app-link"
            href={sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            See All
            <ExternalLink aria-hidden="true" />
          </a>
        )}
      </div>
    </article>
  );
}

function PriceSourceCard({
  source,
  variants,
}: {
  source: PriceSourceName;
  variants: JsonRecord[];
}) {
  const details = SOURCE_DETAILS[source];

  return (
    <article
      className={`grok-price-analysis__source-card grok-price-analysis__source-card--${details.tone} default-container`}
    >
      <div className="grok-price-analysis__source">
        <span aria-hidden="true">
          <PriceSourceIcon icon={details.icon} />
        </span>
        <h3>{details.label}</h3>
      </div>
      <div className="grok-price-analysis__source-content">
        {variants.map((variant, index) => (
          <PriceVariant
            key={`${text(variant.variant_name)}-${index}`}
            source={source}
            variant={variant}
          />
        ))}
      </div>
    </article>
  );
}

function GrokPriceAnalysis({
  grokRequest,
}: Pick<PriceAnalysisProps, "grokRequest">) {
  const { loading, error, response } = grokRequest;

  if (loading) return <LoadingState>Researching sources...</LoadingState>;
  if (error)
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  if (!response) return null;

  const parsed = parseJsonText(response);
  if (!isRecord(parsed) || !Array.isArray(parsed.sources)) {
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  }

  const sources = parsed.sources.flatMap((value) => {
    if (!isRecord(value)) return [];
    const source = text(value.source)?.toLowerCase();
    if (!source || !isPriceSourceName(source)) return [];
    if (typeof value.found !== "boolean" || !Array.isArray(value.variants)) {
      return [];
    }
    return [
      {
        found: value.found,
        source,
        variants: value.variants.filter(isRecord),
      },
    ];
  });
  const displaySources = sources.flatMap(({ found, source, variants }) => {
    if (!found) return [];

    const displayVariants = variants.filter(
      (variant) =>
        Boolean(text(variant.variant_name)) &&
        getVariantFields(source, variant).length > 0,
    );
    return displayVariants.length > 0
      ? [{ source, variants: displayVariants }]
      : [];
  });
  const retrievedAt = text(parsed.timestamp) ?? text(parsed.retrieved_at);

  if (displaySources.length === 0) return null;

  return (
    <section className="grok-price-analysis ui-render-fade">
      <div>
        <h2 className="app-subheader">Other sources</h2>
        <div className="grok-price-analysis__sources">
          {displaySources.map(({ source, variants }) => (
            <PriceSourceCard key={source} source={source} variants={variants} />
          ))}
        </div>
      </div>

      {retrievedAt && (
        <p className="app-view-datestamp">
          Updated: {formatDateStamp(retrievedAt)}
        </p>
      )}
    </section>
  );
}

function JustTcgPriceAnalysis({
  card,
  justTcgRequest,
}: Pick<PriceAnalysisProps, "card" | "justTcgRequest">) {
  if (justTcgRequest.loading) {
    return <LoadingState>Fetching price history...</LoadingState>;
  }

  if (justTcgRequest.error) {
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  }

  if (justTcgRequest.response === null) {
    return null;
  }

  return (
    <JustTcgVariants cardName={card.name} response={justTcgRequest.response} />
  );
}

export function PriceAnalysis({
  card,
  grokRequest,
  justTcgRequest,
  salesDataRequest,
  reportLoading = false,
  reportAvailable = false,
}: PriceAnalysisProps) {
  return (
    <div className="price-analysis-view ui-render-fade">
      <StoredPrices
        card={card}
        reportLoading={reportLoading}
        reportAvailable={reportAvailable}
      />
      <JustTcgPriceAnalysis card={card} justTcgRequest={justTcgRequest} />
      <SalesDataView cardName={card.name} grokRequest={salesDataRequest} />
      <GrokPriceAnalysis grokRequest={grokRequest} />
    </div>
  );
}
