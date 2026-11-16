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
and both prices updated within 30 days. PSA 10 must be at least $350 higher
than the raw price when raw is below $50, or at least $450 higher when raw is
$50 or more.

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
resets generation time. At 49 hours after generation the snapshot is unusable.
A missing or expired list is cached as a miss: 2 minutes in server memory and
10 minutes in the browser. An open page refetches after those 10 minutes.
Failed requests stay retryable and are not cached. A successful empty list is
a valid snapshot and uses the normal cache lifetime.

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
