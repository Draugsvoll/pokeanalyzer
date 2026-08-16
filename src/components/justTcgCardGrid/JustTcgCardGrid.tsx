import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  fetchJustTcgBiggestGainers,
  fetchJustTcgBiggestLosers,
  type JustTcgMovementPeriod,
  type JustTcgMovementResult,
} from "../../services/justTcgFetchesApi";
import { askGrok } from "../../utils/grok/grokClient";
import { marketContextPrompt } from "../../utils/grok/grokPrompts";
import { formatCardNumber } from "../../utils/formatCardNumber";
import Button from "../button/Button";
import { GridView } from "../gridView/GridView";
import { PokemonCardView } from "../pokemonCardView/PokemonCardView";
import { Swimlane } from "../swimlane/Swimlane";
import { SegmentedRadioGroup } from "../ui/SegmentedRadioGroup";
import "./JustTcgCardGrid.scss";

type JustTcgMoverType = "biggestGainers" | "biggestLosers";

type JustTcgCardGridProps = {
  layout?: "grid" | "swimlane";
  period?: JustTcgMovementPeriod;
  periods?: readonly JustTcgMovementPeriod[];
  type?: JustTcgMoverType;
  types?: readonly JustTcgMoverType[];
};

type JustTcgContextCard = {
  analysis: string[];
  cardNumber: string;
  context_id: string;
  name: string;
  percentChange: number | null;
  period: JustTcgMovementPeriod;
  price: string;
  rarity: string;
  series: string;
  setName: string;
};

const periodLabels: Record<JustTcgMovementPeriod, string> = {
  "24h": "24-hour change",
  "7d": "7-day change",
  "30d": "30-day change",
  "90d": "90-day change",
};

const DISPLAY_LIMIT = 20;
const EMPTY_RESULTS: JustTcgMovementResult[] = [];

const money = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function createContextId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const typeLabels: Record<JustTcgMoverType, string> = {
  biggestGainers: "Gainers",
  biggestLosers: "Losers",
};

const typeOptions = [
  { label: "Gainers", value: "biggestGainers" },
  { color: "pink", label: "Losers", value: "biggestLosers" },
] as const;

const periodOptions = [
  { label: "24H", value: "24h" },
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
] as const;

function isJustTcgMoverType(value: string): value is JustTcgMoverType {
  return value === "biggestGainers" || value === "biggestLosers";
}

function isJustTcgMovementPeriod(
  value: string,
): value is JustTcgMovementPeriod {
  return (
    value === "24h" ||
    value === "7d" ||
    value === "30d" ||
    value === "90d"
  );
}

function fetchCardsByType(
  type: JustTcgMoverType,
  signal: AbortSignal,
  period: JustTcgMovementPeriod,
) {
  return type === "biggestGainers"
    ? fetchJustTcgBiggestGainers(signal, period)
    : fetchJustTcgBiggestLosers(signal, period);
}

function buildContextCards(
  results: JustTcgMovementResult[],
  period: JustTcgMovementPeriod,
): JustTcgContextCard[] {
  return results.slice(0, DISPLAY_LIMIT).map(({ card, mover }) => ({
    analysis: [],
    cardNumber: formatCardNumber(card) ?? "",
    context_id: createContextId(),
    name: card.name,
    percentChange: mover.changePercent ?? null,
    period,
    price: `$${money.format(mover.currentPrice)}`,
    rarity: card.rarity ?? mover.rarity ?? "",
    series: card.set?.series ?? "",
    setName: card.set?.name ?? mover.setName ?? "",
  }));
}

function getReturnedContextCard(value: unknown): JustTcgContextCard | null {
  if (!value || typeof value !== "object") return null;

  const item = value as Record<string, unknown>;
  if (
    (!Array.isArray(item.analysis) ||
      !item.analysis.every((entry) => typeof entry === "string")) ||
    typeof item.cardNumber !== "string" ||
    typeof item.context_id !== "string" ||
    typeof item.name !== "string" ||
    !("percentChange" in item) ||
    (typeof item.percentChange !== "number" && item.percentChange !== null) ||
    typeof item.period !== "string" ||
    !isJustTcgMovementPeriod(item.period) ||
    typeof item.price !== "string" ||
    typeof item.rarity !== "string" ||
    typeof item.series !== "string" ||
    typeof item.setName !== "string"
  ) {
    return null;
  }

  return {
    analysis: item.analysis,
    cardNumber: item.cardNumber,
    context_id: item.context_id,
    name: item.name,
    percentChange: item.percentChange,
    period: item.period,
    price: item.price,
    rarity: item.rarity,
    series: item.series,
    setName: item.setName,
  };
}

function parseContextResponse(
  value: string,
  sentItems: JustTcgContextCard[],
) {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Response must be a JSON array.");
  }

  const sentById = new Map<string, JustTcgContextCard>();
  for (const item of sentItems) {
    if (sentById.has(item.context_id)) {
      sentById.delete(item.context_id);
      continue;
    }
    sentById.set(item.context_id, item);
  }

  const nextContextByKey: Record<string, { analysis: string[] }> = {};

  for (const item of parsed) {
    const candidate = getReturnedContextCard(item);
    if (!candidate) continue;

    const sentItem = sentById.get(candidate.context_id);
    if (!sentItem) continue;

    nextContextByKey[sentItem.context_id] = {
      analysis: candidate.analysis,
    };
  }

  return nextContextByKey;
}

function CardLayout({
  children,
  layout,
  renderKey,
}: {
  children: ReactNode;
  layout: "grid" | "swimlane";
  renderKey: string;
}) {
  if (layout === "swimlane") {
    return (
      <div className="justtcg-card-grid__cards ui-render-fade" key={renderKey}>
        <Swimlane size="card">{children}</Swimlane>
      </div>
    );
  }

  return (
    <div className="justtcg-card-grid__cards ui-render-fade" key={renderKey}>
      <GridView>{children}</GridView>
    </div>
  );
}

export function JustTcgCardGrid({
  layout = "grid",
  period = "7d",
  periods,
  type = "biggestGainers",
  types,
}: JustTcgCardGridProps) {
  const titleId = useId();
  const requestControllerRef = useRef<AbortController | null>(null);
  const moverTypes = useMemo(
    () => (types?.length ? [...types] : [type]),
    [type, types],
  );
  const moverPeriods = useMemo(
    () => (periods?.length ? [...periods] : [period]),
    [period, periods],
  );
  const moverTypesKey = moverTypes.join("|");
  const moverPeriodsKey = moverPeriods.join("|");
  const [selectedType, setSelectedType] =
    useState<JustTcgMoverType>(moverTypes[0]);
  const [selectedPeriod, setSelectedPeriod] =
    useState<JustTcgMovementPeriod>(moverPeriods[0]);
  const activeType = moverTypes.includes(selectedType)
    ? selectedType
    : moverTypes[0];
  const activePeriod = moverPeriods.includes(selectedPeriod)
    ? selectedPeriod
    : moverPeriods[0];
  const activeKey = `${activeType}:${activePeriod}`;
  const [resultsByKey, setResultsByKey] = useState<
    Record<string, JustTcgMovementResult[]>
  >({});
  const [errorsByKey, setErrorsByKey] = useState<Record<string, string>>({});
  const [loadingByKey, setLoadingByKey] = useState<Record<string, boolean>>(
    {},
  );
  const [contextPreview, setContextPreview] = useState<{
    key: string;
    payload: JustTcgContextCard[];
  } | null>(null);
  const [contextResponse, setContextResponse] = useState("");
  const [contextError, setContextError] = useState("");
  const [contextLoading, setContextLoading] = useState(false);
  const [contextByKey, setContextByKey] = useState<
    | {
        key: string;
        values: Record<string, { analysis: string[] }>;
      }
    | null
  >(null);
  const cards = resultsByKey[activeKey] ?? EMPTY_RESULTS;
  const error = errorsByKey[activeKey] ?? "";
  const loading = Boolean(loadingByKey[activeKey]);
  const hasError = activeKey in errorsByKey;
  const hasResult = activeKey in resultsByKey;
  const hasMultipleTypes = moverTypes.length > 1;
  const hasMultiplePeriods = moverPeriods.length > 1;
  const showCards = cards.length > 0;
  const showEmpty = !loading && !showCards && (hasResult || hasError);
  const title = hasMultipleTypes ? "Market Movers" : typeLabels[moverTypes[0]];
  const visibleTypeOptions = typeOptions.filter((option) =>
    moverTypes.includes(option.value),
  );
  const visiblePeriodOptions = periodOptions.filter((option) =>
    moverPeriods.includes(option.value),
  );
  const activeContextPayload =
    contextPreview?.key === activeKey ? contextPreview.payload : null;

  useEffect(() => {
    return () => requestControllerRef.current?.abort();
  }, []);

  const loadTypes = useCallback(
    async (
      typesToLoad: JustTcgMoverType[],
      periodsToLoad: JustTcgMovementPeriod[],
    ) => {
      const requests = typesToLoad.flatMap((moverType) =>
        periodsToLoad.map((movementPeriod) => ({
          key: `${moverType}:${movementPeriod}`,
          period: movementPeriod,
          type: moverType,
        })),
      );
      if (requests.length === 0) return;

      const controller = new AbortController();
      requestControllerRef.current?.abort();
      requestControllerRef.current = controller;

      const loadingEntries = Object.fromEntries(
        requests.map((request) => [request.key, true]),
      );

      try {
        setLoadingByKey((current) => ({ ...current, ...loadingEntries }));
        setErrorsByKey((current) => {
          const next = { ...current };
          for (const request of requests) {
            delete next[request.key];
          }
          return next;
        });

        const settledResults = await Promise.allSettled(
          requests.map(async (request) => ({
            key: request.key,
            results: await fetchCardsByType(
              request.type,
              controller.signal,
              request.period,
            ),
          })),
        );

        if (controller.signal.aborted) return;

        setResultsByKey((current) => {
          const next = { ...current };
          for (const result of settledResults) {
            if (result.status === "fulfilled") {
              next[result.value.key] = result.value.results;
            }
          }
          return next;
        });
        setErrorsByKey((current) => {
          const next = { ...current };
          for (let index = 0; index < settledResults.length; index += 1) {
            const result = settledResults[index];
            if (result.status === "rejected") {
              const key = requests[index].key;
              next[key] =
                result.reason instanceof Error
                  ? result.reason.message
                  : "JustTCG cards are unavailable.";
            }
          }
          return next;
        });
      } finally {
        if (!controller.signal.aborted) {
          setLoadingByKey((current) => {
            const next = { ...current };
            for (const request of requests) {
              delete next[request.key];
            }
            return next;
          });
          requestControllerRef.current = null;
        }
      }
    },
    [],
  );

  useEffect(() => {
    const typesToLoad = moverTypesKey.split("|").filter(isJustTcgMoverType);
    const periodsToLoad = moverPeriodsKey
      .split("|")
      .filter(isJustTcgMovementPeriod);
    const timeout = window.setTimeout(() => {
      void loadTypes(typesToLoad, periodsToLoad);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadTypes, moverPeriodsKey, moverTypesKey]);

  const applyContextResponse = (response: string) => {
    if (!contextPreview || contextPreview.key !== activeKey) return;

    try {
      setContextByKey({
        key: activeKey,
        values: parseContextResponse(response, contextPreview.payload),
      });
      setContextError("");
    } catch (error) {
      setContextError(
        error instanceof Error ? error.message : "Invalid context response.",
      );
    }
  };

  const handleApplyContext = () => {
    applyContextResponse(contextResponse);
  };

  const handleAskContext = async () => {
    const payload = contextPreview?.key === activeKey
      ? contextPreview.payload
      : buildContextCards(cards, activePeriod);
    if (payload.length === 0) return;

    setContextLoading(true);
    setContextError("");
    setContextPreview({ key: activeKey, payload });
    try {
      const result = await askGrok(
        marketContextPrompt(payload),
        "manual_test",
      );
      if (!result.ok) {
        setContextError(result.error);
        return;
      }
      setContextResponse(result.text);
      try {
        setContextByKey({
          key: activeKey,
          values: parseContextResponse(result.text, payload),
        });
      } catch (error) {
        setContextError(
          error instanceof Error ? error.message : "Invalid context response.",
        );
      }
    } finally {
      setContextLoading(false);
    }
  };

  return (
    <section
      className="justtcg-card-grid ui-render-fade"
      aria-labelledby={titleId}
    >
      <header className="justtcg-card-grid__header">
        <h2 id={titleId}>{title}</h2>
        {hasMultiplePeriods && (
          <SegmentedRadioGroup
            ariaLabel="JustTCG movement period"
            className="justtcg-card-grid__period-control"
            name={`${titleId}-mover-period`}
            onChange={setSelectedPeriod}
            options={visiblePeriodOptions}
            value={activePeriod}
          />
        )}
        {visibleTypeOptions.length > 1 && (
          <SegmentedRadioGroup
            ariaLabel="JustTCG mover category"
            name={`${titleId}-mover-category`}
            onChange={setSelectedType}
            options={visibleTypeOptions}
            value={activeType}
          />
        )}
        <Button
          disabled={!showCards}
          fill="ghost"
          fitContent
          onClick={handleAskContext}
          size="small"
        >
          {contextLoading ? "Adding..." : "Add Context"}
        </Button>
      </header>

      {showCards && (
        <CardLayout layout={layout} renderKey={`${activeKey}:cards`}>
          {cards
            .slice(0, DISPLAY_LIMIT)
            .map(({ card, mover }, index) => {
              const contextItem = activeContextPayload?.[index];
              const context =
                contextItem && contextByKey?.key === activeKey
                  ? contextByKey.values[contextItem.context_id]
                  : undefined;

              return (
                <PokemonCardView
                  key={[
                    card.id,
                    mover.printing,
                    mover.condition,
                    mover.setName ?? "",
                    index,
                  ].join("-")}
                  card={card}
                  context={context}
                  priceChangeLabel={periodLabels[mover.period]}
                  priceChangePercent={mover.changePercent}
                  priceSource="justtcg"
                  showPriceSourcePicker={true}
                />
              );
            })}
        </CardLayout>
      )}

      {contextPreview?.key === activeKey && (
        <div className="justtcg-card-grid__context-panel">
          <pre className="justtcg-card-grid__context-preview">
            {JSON.stringify(contextPreview.payload, null, 2)}
          </pre>
          <textarea
            aria-label="Returned context JSON"
            className="justtcg-card-grid__context-input"
            onChange={(event) => setContextResponse(event.target.value)}
            placeholder="Paste returned AI JSON array here"
            value={contextResponse}
          />
          <Button
            disabled={!contextResponse.trim() || contextLoading}
            fitContent
            onClick={handleApplyContext}
            size="small"
          >
            Apply Context
          </Button>
          {contextError && (
            <p className="justtcg-card-grid__context-error">{contextError}</p>
          )}
        </div>
      )}

      {showEmpty && (
        <p className="justtcg-card-grid__empty">
          {error || "No cards available for this category."}
        </p>
      )}
    </section>
  );
}
