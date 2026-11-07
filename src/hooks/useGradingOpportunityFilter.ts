import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GRADING_LIST_BROWSER_TTL_MS,
  GRADING_LIST_MAX_AGE_MS,
  isGradingOpportunityListFresh,
  type GradingOpportunityList,
} from "../../shared/gradingOpportunityList";
import { getGradingOpportunityList } from "../services/gradingOpportunityListApi";
import type { PokemonCard } from "../types/pokemon";
import { resolvePokeTraceCardPrice } from "../utils/pokeTracePricing";

export function useGradingOpportunityFilter(load = true) {
  const [list, setList] = useState<GradingOpportunityList | null>(null);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!load) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      const next = await getGradingOpportunityList().catch(() => null);
      if (disposed) return;
      setList(next);
      if (!next) {
        setEnabled(false);
        timer = setTimeout(() => void refresh(), GRADING_LIST_BROWSER_TTL_MS);
        return;
      }
      const remaining =
        Date.parse(next.generatedAt) + GRADING_LIST_MAX_AGE_MS - Date.now();
      timer = setTimeout(
        () => {
          if (!isGradingOpportunityListFresh(next)) {
            setList(null);
            setEnabled(false);
          }
          void refresh();
        },
        Math.max(1, Math.min(GRADING_LIST_BROWSER_TTL_MS, remaining)),
      );
    }
    void refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [load]);

  const available = load && !!list && isGradingOpportunityListFresh(list);
  const active = enabled && available;
  const prices = useMemo(
    () =>
      new Map(
        list?.items.map(({ cardId, psa10Price }) => [cardId, psa10Price]),
      ),
    [list],
  );
  const multiplier = useCallback(
    (card: PokemonCard) => {
      const psaPrice = prices.get(card.id);
      const nearMintPrice = resolvePokeTraceCardPrice(card)?.price;
      if (
        !psaPrice ||
        !nearMintPrice ||
        !Number.isFinite(nearMintPrice) ||
        nearMintPrice <= 0
      )
        return null;
      const ratio = psaPrice / nearMintPrice;
      return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
    },
    [prices],
  );
  return { available, active, setEnabled, multiplier };
}
