export const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

export class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "RequestTimeoutError";
  }
}

type RequestTimeoutOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export async function runWithRequestTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  options: RequestTimeoutOptions = {},
) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Request timeout must be a positive number");
  }
  if (options.signal?.aborted) {
    throw options.signal.reason;
  }

  const controller = new AbortController();
  let timedOut = false;

  const abortFromCaller = () => {
    controller.abort(options.signal?.reason);
  };
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  let handleCancellation = () => undefined;
  const cancellation = new Promise<never>((_resolve, reject) => {
    handleCancellation = () => {
      if (!timedOut) reject(controller.signal.reason);
    };
    controller.signal.addEventListener("abort", handleCancellation, {
      once: true,
    });
  });
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new RequestTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      request(controller.signal),
      cancellation,
      timeout,
    ]);
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", abortFromCaller);
    controller.signal.removeEventListener("abort", handleCancellation);
  }
}
