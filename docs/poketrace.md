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
cards. Daily history stores exactly one value per card and UTC date: TCGPlayer's
Near Mint market price. It does not store low/high values, sales counts, eBay,
Cardmarket, graded prices, or other conditions. Rerunning the job on the same
UTC date replaces that day's value instead of duplicating it. History older
than 40 days is removed by default.

After each successful card refresh, the card row also receives a compact
`tcg_market_comparisons` cache for 1, 7, and 30 days. Each entry contains the
target date, the actual snapshot date, the market price, and the upstream
update time. Selection prefers the exact target date, then one day older, then
one day newer; the entry is `null` when none of those dates exists. The daily
history table remains the source of truth. Existing rows without this cache
fall back to history until their next refresh.

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
