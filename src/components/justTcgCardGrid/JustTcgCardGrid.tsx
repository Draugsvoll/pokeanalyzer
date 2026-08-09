import type { ReactNode } from "react";
import { useEffect, useId, useMemo, useState } from "react";
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
  const typesKey = types?.length ? types.join("|") : type;
  const moverTypes = useMemo(
    () => (types?.length ? [...types] : [type]),
    [type, typesKey],
  );
  const [activeType, setActiveType] = useState<JustTcgMoverType>(moverTypes[0]);
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
    if (!moverTypes.includes(activeType)) {
      setActiveType(moverTypes[0]);
    }
  }, [activeType, moverTypes]);

  useEffect(() => {
    const controller = new AbortController();
    const missingTypes = moverTypes.filter((moverType) => {
      const key = `${moverType}:${period}`;
      return !resultsByKey[key] && !errorsByKey[key] && !loadingByKey[key];
    });

    if (missingTypes.length === 0) return;

    async function loadCards(moverType: JustTcgMoverType) {
      const key = `${moverType}:${period}`;
      try {
        setLoadingByKey((current) => ({ ...current, [key]: true }));
        setErrorsByKey((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });

        const results =
          moverType === "biggestGainers"
            ? await fetchJustTcgBiggestGainers(controller.signal, period)
            : await fetchJustTcgBiggestLosers(controller.signal, period);

        if (!controller.signal.aborted) {
          setResultsByKey((current) => ({
            ...current,
            [key]: results,
          }));
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setResultsByKey((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        setErrorsByKey((current) => ({
          ...current,
          [key]:
            loadError instanceof Error
              ? loadError.message
              : "JustTCG cards are unavailable.",
        }));
      } finally {
        if (!controller.signal.aborted) {
          setLoadingByKey((current) => {
            const next = { ...current };
            delete next[key];
            return next;
          });
        }
      }
    }

    missingTypes.forEach((moverType) => {
      void loadCards(moverType);
    });

    return () => controller.abort();
  }, [moverTypes, period]);

  if (!hasMultipleTypes && !loading && (error || cards.length === 0)) {
    return null;
  }

  return (
    <section className="justtcg-card-grid ui-render-fade" aria-labelledby={titleId}>
      <header className="justtcg-card-grid__header">
        <h2 id={titleId}>{title}</h2>
        <div className="justtcg-card-grid__header-actions">
          {visibleTypeOptions.length > 1 && (
            <SegmentedRadioGroup
              ariaLabel="JustTCG mover category"
              name={`${titleId}-mover-category`}
              onChange={setActiveType}
              options={visibleTypeOptions}
              value={activeType}
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

      {showEmpty && hasMultipleTypes && (
        <p className="justtcg-card-grid__empty">
          {error || "No cards available for this category."}
        </p>
      )}
    </section>
  );
}
