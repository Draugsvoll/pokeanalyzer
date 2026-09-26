# PokeTrace catalogue and daily prices

For local development, add `POKETRACE_API_KEY=...` and
`ALLOW_LOCAL_DATABASE=true` to `.env`, then run:

```sh
npm run poketrace:import-catalog
npm run start
```

The import saves 20 English Pokémon singles from the US market in
`server/db/poketrace.sqlite`. Continue the same checkpoint through the full
English US single-card catalogue with:

```sh
npm run poketrace:import-catalog -- all
```

Import one known PokeTrace card UUID with:

```sh
npm run poketrace:import-card -- <card-uuid>
```

The list API returns at most 20 cards per request. The import spaces requests by
2.1 seconds for the free-tier burst limit. It saves the cursor and cards together
after each page, so rerunning the command resumes where it stopped.

Refresh the cards with the oldest successful price update first with:

```sh
npm run poketrace:refresh-oldest
```

The default batch is 50,000 cards, which refreshes the whole current catalogue
in one run. Pass a different limit as the first argument,
or set `POKETRACE_DAILY_CARD_LIMIT`. The cron command uses the same queue:

```sh
npm run poketrace:refresh-daily
```

The refresher groups cards with TCGPlayer IDs into lookups of up to 20 IDs and
uses individual requests for cards without a usable reference. Successful cards
receive a new `price_refreshed_at` value and move to the back of the queue.
Failed cards receive an exponential retry delay, so they do not block other
cards. The existing daily history stores exactly one value per card and UTC
date: TCGPlayer's Near Mint market price. Rerunning the job on the same UTC date
replaces that day's value instead of duplicating it. History older than 40 days
is removed by default.

At the end of every completed refresh, the job builds the compact browser
search catalogue and atomically replaces one stored payload in Turso. If
catalogue generation or storage fails, the job exits with an error and the
previous payload remains available. The backend reads this stored payload on a
cold start instead of scanning the complete card table during a user request.
Generate the same payload immediately from the cards already stored in Turso
without running a price refresh with:

```sh
npm run poketrace:generate-catalog
```

The standalone generator uses the same maintenance lock as import and refresh,
so it skips safely rather than reading while another catalogue job is writing.

The same refresh also writes one supplemental `poketrace_market_snapshots` row
per card and UTC date. Its `tcg` and `ebay` JSON fields preserve the complete
Near Mint, Lightly Played, Moderately Played, and Damaged objects returned by
PokeTrace. Each available condition remains nested under its upstream condition
name and preserves values such as `avg`, `low`, `high`, `saleCount`, and
`approxSaleCount`. A missing source is stored as `NULL`, and unavailable
conditions are omitted. No supplemental row is written when neither source has
one of the supported conditions. These snapshots contain no locally calculated
market values, are replaced when the same card is refreshed again on the same
UTC date, and are removed after 35 days. Cardmarket, graded prices, and Mint are
not included.

## Market categories

Generate all configured market categories independently of the refresh job with:

```sh
npm run poketrace:generate-market-categories
```

The command reads existing snapshots, generates every definition in
`server/config/marketCategories.ts`, and upserts the complete payload as one row
in the PokeTrace database. Price-mover categories support a direction, source,
condition, comparison period, minimum price movement, minimum current sales,
minimum new sales, result limit, and percentage or absolute sorting.

The `mostSold` query compares the combined `saleCount` totals across the selected
conditions for one source and period. A negative combined difference becomes
zero. These are changes in upstream reported sales-window counts, not locally
calculated lifetime sales.

The backend serves the stored payload from `GET /api/market-categories`.
Homepage and Explore cache the complete response in browser storage for 24
hours; missing, expired, or invalid cached data is fetched from the server. Run
the generator manually or assign its npm command to a separate cron schedule. It
is intentionally not invoked by the daily price refresh.

After each successful card refresh, the card row also receives a compact
`tcg_market_comparisons` cache for 1, 7, and 30 days. Each entry contains the
target date, the actual snapshot date, the market price, and the upstream
update time. Selection prefers the exact target date, then one day older, then
one day newer; the entry is `null` when none of those dates exists. The daily
history table remains the source of truth. Existing rows without this cache
fall back to history until their next refresh.

Opening a card also requests 90 days of `NEAR_MINT` history. Available
TCGPlayer and eBay rows are normalized into separate series and stored with one
fetch timestamp on the card row. The cache is reused for six hours, then
refreshed and overwritten. If an upstream refresh fails, existing stored series
are returned as stale instead of removing the chart.

Import and refresh share a database lock. If either job is already running, the
other skips its run successfully. A daily quota stop preserves all completed
cards and exits with a failure status so the cron execution is visibly
incomplete.

For deployment, set `POKETRACE_DATABASE_URL` and
`POKETRACE_DATABASE_AUTH_TOKEN` on both the web and cron services. They must use
the same libSQL database; a local SQLite file cannot be shared between separate
Railway services.

PokeTrace's free plan is for personal use; commercial deployment needs a paid
plan under its published pricing.
