import { normalizePokeTraceSetSummary } from "../../../shared/pokeTraceSetSummaryValidation";
import { POKETRACE_CURRENCY } from "../../../shared/pokeTraceCurrency";
import type { PokeTraceSetNameOption } from "../../hooks/usePokeTraceSetNameOptions";
import { isPokeTraceSetSummaryFresh } from "../../utils/pokeTraceSetSummaryFreshness";

const WEEKLY_SET_LIMIT = 6;

type WeeklySetRankings<T> = { gainers: T[]; losers: T[] };

export function selectWeeklyMovers<T extends PokeTraceSetNameOption>(
  options: readonly T[],
  { now = Date.now() }: { now?: number } = {},
): WeeklySetRankings<T> | null {
  try {
    const comparable: Array<{ option: T; change: number }> = [];
    const seen = new Set<string>();
    for (const option of options) {
      const raw = option.setSummary;
      // Missing history is normal; malformed comparable data invalidates both rankings.
      if (
        raw == null ||
        raw.sevenDayChangePercent === null ||
        raw.comparableCards === 0
      )
        continue;
      const summary = normalizePokeTraceSetSummary(raw);
      if (
        !summary ||
        !isPokeTraceSetSummaryFresh(summary.asOf, now) ||
        summary.currency !== POKETRACE_CURRENCY ||
        summary.sevenDayChangePercent === null
      )
        return null;
      const name = option.value.trim().toLocaleLowerCase("en-US");
      if (name !== summary.setName.toLocaleLowerCase("en-US") || seen.has(name))
        return null;
      seen.add(name);
      comparable.push({ option, change: summary.sevenDayChangePercent });
    }
    if (comparable.length < WEEKLY_SET_LIMIT) return null;

    const rank = (direction: -1 | 1) =>
      comparable
        .toSorted(
          (left, right) =>
            direction * (left.change - right.change) ||
            left.option.value.localeCompare(right.option.value, "en-US"),
        )
        .slice(0, WEEKLY_SET_LIMIT)
        .map(({ option }) => option);
    return { gainers: rank(-1), losers: rank(1) };
  } catch {
    return null;
  }
}
