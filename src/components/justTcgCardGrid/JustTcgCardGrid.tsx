import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  fetchJustTcgBiggestGainers,
  fetchJustTcgBiggestLosers,
  type JustTcgMovementPeriod,
  type JustTcgMovementResult,
} from "../../services/justTcgFetchesApi";
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

const periodLabels: Record<JustTcgMovementPeriod, string> = {
  "24h": "24-hour change",
  "7d": "7-day change",
  "30d": "30-day change",
};

const DISPLAY_LIMIT = 20;

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
] as const;

function isJustTcgMoverType(value: string): value is JustTcgMoverType {
  return value === "biggestGainers" || value === "biggestLosers";
}

function isJustTcgMovementPeriod(
  value: string,
): value is JustTcgMovementPeriod {
  return value === "24h" || value === "7d" || value === "30d";
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
  const cards = resultsByKey[activeKey] ?? [];
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

  return (
    <section className="justtcg-card-grid ui-render-fade" aria-labelledby={titleId}>
      <header className="justtcg-card-grid__header">
        <h2 id={titleId}>{title}</h2>
        <div className="justtcg-card-grid__header-actions">
          {visibleTypeOptions.length > 1 && (
            <SegmentedRadioGroup
              ariaLabel="JustTCG mover category"
              name={`${titleId}-mover-category`}
              onChange={setSelectedType}
              options={visibleTypeOptions}
              value={activeType}
            />
          )}
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
        </div>
      </header>

      {showCards && (
        <CardLayout layout={layout} renderKey={`${activeKey}:cards`}>
          {cards
            .slice(0, DISPLAY_LIMIT)
            .map(({ card, mover }, index) => (
              <PokemonCardView
                key={[
                  card.id,
                  mover.printing,
                  mover.condition,
                  mover.setName ?? "",
                  index,
                ].join("-")}
                card={card}
                priceChangeLabel={periodLabels[mover.period]}
                priceChangePercent={mover.changePercent}
                priceSource="justtcg"
                showPriceSourcePicker={true}
              />
            ))}
        </CardLayout>
      )}

      {showEmpty && (
        <p className="justtcg-card-grid__empty">
          {error || "No cards available for this category."}
        </p>
      )}
    </section>
  );
}
