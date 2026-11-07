# Grading opportunity filter

`npm run poketrace:generate-market-categories` runs the existing category script,
then the separate `generateGradingOpportunityList.ts` script. The standalone
command is `npm run poketrace:generate-grading-list`.

Both use `server/config/gradingOpportunities.ts` and the same qualification query:
TCG Near Mint average, PSA 10 30-day median, the configured sales, price-gain,
and update-age thresholds, excluding identical three-day/seven-day/thirty-day
PSA medians. The existing category returns its top 12; the new script explicitly
requests unlimited results. The maintenance lock protects generation.
The current thresholds are at least 40 sales for both TCG Near Mint and PSA 10,
at least $450 more for PSA 10 than the raw price, and both prices updated within
30 days.

The new `poketrace_grading_opportunities` Turso table holds a single `current`
JSON snapshot with `schemaVersion`, `generatedAt`, and `{ cardId, psa10Price }`
items. Schema version 2 identifies 30-day median prices and rejects older 7-day
snapshots. One upsert atomically replaces the full list after successful generation;
an empty success clears it, while failures preserve the previous list.
The normal PokeTrace deployment migration creates the table. The new generator
also initializes its own store idempotently, so the first category-generation
run can populate it without a separate manual setup step.

`GET /api/market-categories/grading-opportunities-list` caches Turso reads in
server memory for 24 hours per server process and shares simultaneous requests.
The client stores the validated snapshot in localStorage for six hours under
`pokelyzer:grading-opportunities:v2`, with an in-memory fallback. Neither cache
resets generation time. At 48 hours after generation the snapshot is unusable,
even when its cache TTL has not expired. New generations may take time to become
visible through these caches. Failed requests are retryable, not cached.
Successful `null` (no-list) responses are also cached with a fetch timestamp:
six hours in the browser and 24 hours on the server. Open grids retry after
six hours when no list is available. A newly generated list can remain hidden
until these negative caches expire.

Card category grids, set-card results, single-card search results (including embedded search), and
collection/watchlist grids offer the checkbox when a valid snapshot is available.
The filter matches exact IDs among loaded cards, before visible-page slicing;
it never fetches additional matching cards. Text/rarity filters and sorting
continue to apply. Sealed products do not match.

While enabled, matching cards use the grading opportunity badge and normal TCG
Near Mint prices. The multiplier is the saved PSA 10 30-day median divided
by the card's current TCG Near Mint price, which must be finite and positive.
The shared badge preserves the existing appearance, rounded whole-number label,
tooltip, and hover movement. Unchecking restores normal card views. Unavailable
or expired lists hide the checkbox and cease filtering, including on open pages.
