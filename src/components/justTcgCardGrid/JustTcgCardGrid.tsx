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
import Button from "../button/Button";
import { SegmentedRadioGroup } from "../ui/SegmentedRadioGroup";
import "./JustTcgCardGrid.scss";

type JustTcgMoverType = "biggestGainers" | "biggestLosers";

type JustTcgCardGridProps = {
  layout?: "grid" | "swimlane";
  period?: JustTcgMovementPeriod;
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
  biggestGainers: "Weekly Gainers",
  biggestLosers: "Weekly Losers",
};

const typeOptions = [
  { color: "blue", label: "Gainers", value: "biggestGainers" },
  { color: "blue", label: "Losers", value: "biggestLosers" },
] as const;

function isJustTcgMoverType(value: string): value is JustTcgMoverType {
  return value === "biggestGainers" || value === "biggestLosers";
}

function fetchCardsByType(
  type: JustTcgMoverType,
  signal: AbortSignal,
  period: JustTcgMovementPeriod,
  forceRefresh = false,
) {
  return type === "biggestGainers"
    ? fetchJustTcgBiggestGainers(signal, period, { forceRefresh })
    : fetchJustTcgBiggestLosers(signal, period, { forceRefresh });
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
  type = "biggestGainers",
  types,
}: JustTcgCardGridProps) {
  const titleId = useId();
  const requestControllerRef = useRef<AbortController | null>(null);
  const moverTypes = useMemo(
    () => (types?.length ? [...types] : [type]),
    [type, types],
  );
  const moverTypesKey = moverTypes.join("|");
  const [selectedType, setSelectedType] =
    useState<JustTcgMoverType>(moverTypes[0]);
  const activeType = moverTypes.includes(selectedType)
    ? selectedType
    : moverTypes[0];
  const activeKey = `${activeType}:${period}`;
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
  const loadingAny = moverTypes.some((moverType) =>
    Boolean(loadingByKey[`${moverType}:${period}`]),
  );
  const hasError = activeKey in errorsByKey;
  const hasResult = activeKey in resultsByKey;
  const hasMultipleTypes = moverTypes.length > 1;
  const showCards = cards.length > 0;
  const showEmpty = !loading && !showCards && (hasResult || hasError);
  const title =
    hasMultipleTypes ? "Weekly Movers" : typeLabels[moverTypes[0]];
  const visibleTypeOptions = typeOptions.filter((option) =>
    moverTypes.includes(option.value),
  );

  useEffect(() => {
    return () => requestControllerRef.current?.abort();
  }, []);

  const loadTypes = useCallback(
    async (typesToLoad: JustTcgMoverType[], forceRefresh = false) => {
      if (typesToLoad.length === 0) return;

      const controller = new AbortController();
      requestControllerRef.current?.abort();
      requestControllerRef.current = controller;

      const loadingEntries = Object.fromEntries(
        typesToLoad.map((moverType) => [`${moverType}:${period}`, true]),
      );

      try {
        setLoadingByKey((current) => ({ ...current, ...loadingEntries }));
        setErrorsByKey((current) => {
          const next = { ...current };
          for (const moverType of typesToLoad) {
            delete next[`${moverType}:${period}`];
          }
          return next;
        });

        const settledResults = await Promise.allSettled(
          typesToLoad.map(async (moverType) => ({
            key: `${moverType}:${period}`,
            results: await fetchCardsByType(
              moverType,
              controller.signal,
              period,
              forceRefresh,
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
              const key = `${typesToLoad[index]}:${period}`;
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
            for (const moverType of typesToLoad) {
              delete next[`${moverType}:${period}`];
            }
            return next;
          });
          requestControllerRef.current = null;
        }
      }
    },
    [period],
  );

  useEffect(() => {
    const typesToLoad = moverTypesKey.split("|").filter(isJustTcgMoverType);
    const timeout = window.setTimeout(() => {
      void loadTypes(typesToLoad, false);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadTypes, moverTypesKey]);

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
          <Button
            disabled={loadingAny}
            onClick={() => void loadTypes(moverTypes, true)}
            size="small"
          >
            {loadingAny ? "Fetching..." : hasResult ? "Refresh" : "Fetch movers"}
          </Button>
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
