import assert from "node:assert/strict";
import test from "node:test";
import {
  isRetryableApiFailure,
  parseRetryAfterMs,
  retryDelayMs,
} from "./pokemonTcgRetryPolicy.js";

test("retry policy retries transport, rate-limit, and server failures", () => {
  assert.equal(
    isRetryableApiFailure({
      isTransportFailure: true,
      status: null,
    }),
    true,
  );
  assert.equal(
    isRetryableApiFailure({
      isTransportFailure: false,
      status: 408,
    }),
    true,
  );
  assert.equal(
    isRetryableApiFailure({
      isTransportFailure: false,
      status: 429,
    }),
    true,
  );
  assert.equal(
    isRetryableApiFailure({
      isTransportFailure: false,
      status: 500,
    }),
    true,
  );
});

test("retry policy immediately rejects non-retryable HTTP and validation failures", () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    assert.equal(
      isRetryableApiFailure({
        isTransportFailure: false,
        status,
      }),
      false,
    );
  }
  assert.equal(
    isRetryableApiFailure({
      isTransportFailure: false,
      status: null,
    }),
    false,
  );
});

test("retry delay is exponential, capped, jittered, and honors Retry-After", () => {
  assert.equal(retryDelayMs(1, null, 0.5), 5000);
  assert.equal(retryDelayMs(2, null, 0.5), 10_000);
  assert.equal(retryDelayMs(8, null, 0.5), 60_000);
  assert.equal(retryDelayMs(1, 120_000, 0.5), 120_000);
  assert.equal(retryDelayMs(1, null, 0), 4000);
  assert.equal(retryDelayMs(1, null, 1), 6000);
});

test("Retry-After supports seconds and HTTP dates", () => {
  assert.equal(parseRetryAfterMs("30"), 30_000);
  assert.equal(parseRetryAfterMs(5), 5000);
  assert.equal(
    parseRetryAfterMs(
      "Wed, 01 Jan 2025 00:01:00 GMT",
      Date.parse("Wed, 01 Jan 2025 00:00:00 GMT"),
    ),
    60_000,
  );
  assert.equal(parseRetryAfterMs("not-a-date"), null);
});
