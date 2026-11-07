import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  GRADING_LIST_MAX_AGE_MS,
  GRADING_LIST_SERVER_TTL_MS,
  parseGradingOpportunityList,
  type GradingOpportunityList,
} from "../../shared/gradingOpportunityList.js";
import {
  createGradingOpportunityListCache,
  ensureGradingOpportunityListStore,
  loadGradingOpportunityList,
  saveGradingOpportunityList,
} from "./gradingOpportunityList.js";

const snapshot: GradingOpportunityList = {
  schemaVersion: 2,
  generatedAt: "2026-11-01T00:00:00.000Z",
  items: [{ cardId: "one", psa10Price: 500 }],
};

test("atomically replaces complete lists, including an empty success, and preserves data on invalid writes", async () => {
  const db = createClient({ url: "file::memory:" });
  try {
    await ensureGradingOpportunityListStore(db);
    assert.equal(await loadGradingOpportunityList(db), null);
    await saveGradingOpportunityList(db, snapshot);
    await assert.rejects(
      saveGradingOpportunityList(db, {
        ...snapshot,
        items: [...snapshot.items, ...snapshot.items],
      }),
    );
    assert.deepEqual(await loadGradingOpportunityList(db), snapshot);
    const next = { ...snapshot, items: [{ cardId: "two", psa10Price: 750 }] };
    await saveGradingOpportunityList(db, next);
    assert.deepEqual(await loadGradingOpportunityList(db), next);
    await saveGradingOpportunityList(db, { ...next, items: [] });
    assert.deepEqual((await loadGradingOpportunityList(db))?.items, []);
    assert.throws(() =>
      parseGradingOpportunityList({
        ...snapshot,
        items: [{ cardId: "bad", psa10Price: 0 }],
      }),
    );
    assert.throws(() =>
      parseGradingOpportunityList({ ...snapshot, schemaVersion: 1 }),
    );
  } finally {
    db.close();
  }
});

test("deduplicates server loads, caches 24h, and rejects 48h-old snapshots even within cache TTL", async () => {
  let now = Date.parse(snapshot.generatedAt);
  let calls = 0;
  const cached = createGradingOpportunityListCache(
    async () => {
      calls++;
      return snapshot;
    },
    () => now,
  );
  assert.deepEqual(await Promise.all([cached(), cached()]), [
    snapshot,
    snapshot,
  ]);
  assert.equal(calls, 1);
  now += GRADING_LIST_SERVER_TTL_MS - 1;
  assert.deepEqual(await cached(), snapshot);
  assert.equal(calls, 1);
  now++;
  await cached();
  assert.equal(calls, 2);
  // Fetch at age 47h, then expire at 48h despite that freshly loaded cache.
  let lateNow = Date.parse(snapshot.generatedAt) + GRADING_LIST_MAX_AGE_MS - 1;
  const lateCache = createGradingOpportunityListCache(
    async () => snapshot,
    () => lateNow,
  );
  assert.deepEqual(await lateCache(), snapshot);
  lateNow++;
  assert.equal(await lateCache(), null);
});

test("server failures are retryable and future-dated lists are unusable", async () => {
  let calls = 0;
  const cached = createGradingOpportunityListCache(
    async () => {
      if (++calls === 1) throw new Error("temporary failure");
      return snapshot;
    },
    () => Date.parse(snapshot.generatedAt),
  );
  await assert.rejects(cached());
  assert.deepEqual(await cached(), snapshot);
  assert.equal(calls, 2);
  const future = createGradingOpportunityListCache(
    async () => snapshot,
    () => Date.parse(snapshot.generatedAt) - 1,
  );
  assert.equal(await future(), null);
});

test("a missing list is cached with a timestamp and renewed after 24 hours", async () => {
  let stored: GradingOpportunityList | null = null;
  let now = Date.parse(snapshot.generatedAt);
  let calls = 0;
  const cached = createGradingOpportunityListCache(
    async () => {
      calls++;
      return stored;
    },
    () => now,
  );
  assert.equal(await cached(), null);
  stored = snapshot;
  now += GRADING_LIST_SERVER_TTL_MS - 1;
  assert.equal(await cached(), null);
  assert.equal(calls, 1);
  now++;
  assert.deepEqual(await cached(), snapshot);
  assert.equal(calls, 2);
});
