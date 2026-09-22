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

The same refresh also writes one supplemental `poketrace_market_snapshots` row
per card and UTC date. Its `tcg` and `ebay` JSON fields preserve the complete
Near Mint, Lightly Played, Moderately Played, and Damaged objects returned by
PokeTrace. Each available condition remains nested under its upstream condition
name and preserves values such as `avg`, `low`, `high`, `saleCount`, and
`approxSaleCount`. A missing source is stored as `NULL`, and unavailable
conditions are omitted. No supplemental row is written when neither source has
one of the supported conditions. These snapshots contain no locally calculated
market values, are replaced when the same card is refreshed again on the same
UTC date, and are removed after 35 days. Cardmarket, graded prices, Mint, and
Heavily Played are not included.

## Static market categories

Generate all configured market categories independently of the refresh job with:

```sh
npm run poketrace:generate-market-categories
```

The command reads existing snapshots without changing the database and writes
`public/market-categories.json`. Configure categories in
`server/config/marketCategories.ts`. Each `priceGainers` category supports a
market source, condition, comparison period in days, minimum current and prior
price, minimum absolute and percentage change, result limit, and percentage or
absolute sorting. Duplicate the definition to publish several categories in the
same JSON file.

The `mostSold` category sums the latest reported `saleCount` across all stored
conditions. Its `source` can be `tcgplayer`, `ebay`, or `both`; `both` adds the
two source totals per card. `minimumPrice` is applied to each source/condition
bucket before its `saleCount` is included. These are upstream reported
sales-window counts, not locally calculated lifetime sales.

Set `MARKET_CATEGORIES_OUTPUT_PATH` to write somewhere else. The generator is a
standalone process: run it manually or assign its npm command to a separate cron
schedule whenever the JSON should be refreshed. It is intentionally not invoked
by the daily price refresh.

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
