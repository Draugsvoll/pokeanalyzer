const SET_SUMMARY_MAX_AGE_MS = 36 * 60 * 60 * 1_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

export function isPokeTraceSetSummaryFresh(asOf: string, now = Date.now()) {
  const timestamp = Date.parse(asOf);
  return (
    Number.isFinite(timestamp) &&
    timestamp <= now + MAX_CLOCK_SKEW_MS &&
    now - timestamp < SET_SUMMARY_MAX_AGE_MS
  );
}
