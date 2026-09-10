export const API_MAX_RETRIES = 10;
export const API_REQUEST_DELAY_MS = 5000;
export const API_REQUEST_TIMEOUT_MS = 60_000;

const MAX_RETRY_AFTER_MS = 5 * 60_000;
const RETRY_DELAY_STEP_MS = 40_000;
const RETRY_JITTER_MS = 5_000;

export type ApiFailureKind = {
  isTransportFailure: boolean;
  status: number | null;
};

export function isRetryableApiFailure({
  isTransportFailure,
  status,
}: ApiFailureKind): boolean {
  if (status !== null) {
    return status === 408 || status === 429 || status >= 500;
  }
  return isTransportFailure;
}

export function parseRetryAfterMs(
  value: unknown,
  nowMs = Date.now(),
): number | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate === "number") {
    return Number.isFinite(candidate) && candidate >= 0
      ? Math.min(candidate * 1000, MAX_RETRY_AFTER_MS)
      : null;
  }
  if (typeof candidate !== "string" || !candidate.trim()) return null;

  const seconds = Number(candidate);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }

  const retryDateMs = Date.parse(candidate);
  if (!Number.isFinite(retryDateMs)) return null;
  return Math.min(
    Math.max(0, retryDateMs - nowMs),
    MAX_RETRY_AFTER_MS,
  );
}

export function retryDelayMs(
  failedAttempt: number,
  retryAfterMs: number | null,
  randomValue = Math.random(),
): number {
  if (!Number.isSafeInteger(failedAttempt) || failedAttempt < 1) {
    throw new Error("Retry attempt must be a positive integer");
  }
  const boundedRandom = Math.min(1, Math.max(0, randomValue));
  const jitterMs = Math.round(
    (boundedRandom * 2 - 1) * RETRY_JITTER_MS,
  );
  const baseDelay = Math.min(
    failedAttempt * RETRY_DELAY_STEP_MS,
    MAX_RETRY_AFTER_MS,
  );
  const scheduledDelay = baseDelay + jitterMs;
  return Math.max(scheduledDelay, retryAfterMs ?? 0);
}
