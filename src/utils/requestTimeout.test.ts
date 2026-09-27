import { afterEach, describe, expect, test, vi } from "vitest";
import { RequestTimeoutError, runWithRequestTimeout } from "./requestTimeout";

afterEach(() => {
  vi.useRealTimers();
});

function waitUntilAborted(signal: AbortSignal) {
  return new Promise<never>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

describe("runWithRequestTimeout", () => {
  test("aborts and rejects a request that exceeds its deadline", async () => {
    vi.useFakeTimers();
    const request = runWithRequestTimeout(
      () => new Promise<never>(() => undefined),
      { timeoutMs: 100 },
    );
    const rejection =
      expect(request).rejects.toBeInstanceOf(RequestTimeoutError);

    await vi.advanceTimersByTimeAsync(100);

    await rejection;
  });

  test("preserves cancellation from the caller", async () => {
    const controller = new AbortController();
    const request = runWithRequestTimeout(waitUntilAborted, {
      signal: controller.signal,
    });

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
