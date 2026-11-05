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

The generated filter-options payload also acts as the saved set list. It
contains optional per-set 7-day Near Mint changes derived from the same catalog.
Each set uses one card per card number, choosing the cheapest valid Near Mint
printing, and compares the sum of current prices with the sum of matching
7-day prices. Missing history leaves that set without a change value. The
complete payload is validated and replaced atomically only after every set has
been processed.

Rebuild this set list without refreshing upstream prices with:

```sh
npm run poketrace:generate-set-list
```

The command reuses the saved catalog and generates and saves it from the cards
table only when it is missing.

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

The configured daily TCG gainers and losers use `useCachedOneDayComparison` to
rank the existing cached Near Mint 1d percentage changes. Both prices must be
at least $20. Cards must have at least 200 Near Mint sales in the latest sales
snapshot and an increase of at least 2 from the previous snapshot. These are
the two newest distinct TCG snapshot dates within the last 6 UTC calendar days
(inclusive of the date 6 days ago); future dates are excluded. Both snapshots
must contain numeric Near Mint counts for the card, and its cached comparison
must be current as of the latest selected snapshot. The top 12 positive changes
are gainers; the top 12 negative changes are losers. Other conditions do not
contribute to eligibility. Fewer than two qualifying snapshot dates produces
`insufficient_history`; no matching cards produces a ready, empty category.
The returned snapshot dates describe the sales qualification interval; the
price change remains the cached 1d comparison. Generic fixed-period queries
are unchanged when `useCachedOneDayComparison` is false.

The `mostSold` query compares the combined `saleCount` totals across the selected
conditions for one source and period. A negative combined difference becomes
zero. These are changes in upstream reported sales-window counts, not locally
calculated lifetime sales. The configured TCGPlayer best-seller feed uses every
stored condition. The eBay feed uses Near Mint only, requires a Near Mint price
of at least $20, and requires the current Near Mint `saleCount` to be at least 150. Both feeds use the latest three distinct snapshot dates available for that
source, require the measured total to increase between each snapshot, and rank
by the increase from the oldest snapshot to the newest. All three dates must be
within the last 10 UTC calendar days (inclusive of the date 10 days ago); future
dates are excluded. Fewer than three qualifying dates produces
`insufficient_history`.
Every ranked card must have comparable sales counts on all three selected dates.
The returned comparison dates and period reflect the actual interval, and the
frontend shows those dates in the sales tooltip. The search grids are titled
"TCG high volume this week" and "Ebay high volume this week".

The `gradingOpportunities` category compares the standard TCGPlayer Near Mint
`avg` with the eBay PSA 10 `median7d`. The Near Mint price used in calculations
is the same price displayed on the card. Cards missing either positive price
are excluded, with no PSA 10 fallback. A card qualifies when both sale counts
are at least 75, both prices were updated within the last 30 days, and the PSA 10
median is at least $500 higher. The top 12 are ranked by the PSA 10 seven-day
median divided by the TCGPlayer Near Mint average. The
search grid is titled "Grading Opportunities".

The backend serves the stored payload from `GET /api/market-categories`.
Homepage and Explore cache the complete response in browser storage for 24
hours when every category has sufficient history. Incomplete history is shown
as an empty state without a retry button and is kept only in memory for the
current page visit, so reloading fetches the saved server results again. Old
browser caches containing insufficient history are also discarded. Missing,
expired, or invalid cached data is fetched from the server. Run
the generator manually or assign its npm command to a separate cron schedule. It
is intentionally not invoked by the daily price refresh.

After each successful card refresh, the card row also receives a compact
`tcg_market_comparisons` cache for 1, 7, and 30 days. Each entry contains the
target date, the actual snapshot date, the market price, and the upstream
update time. Selection prefers the exact target date, then one day older, then
one day newer; the entry is `null` when none of those dates exists. The daily
history table remains the source of truth. Existing rows without this cache
fall back to history until their next refresh.

Opening a card requests the first page of all-time `NEAR_MINT` history (up to
365 rows, without pagination). The chart always offers four local period
controls: **1M** (30 days), **3M** (90 days), **6M** (180 days), and **All**
(all available returned history). There is no 365-day option. The All view includes the year on dates
from previous years. Available TCGPlayer and eBay rows are normalized into
separate series and stored with one fetch timestamp on the card row. The cache
is reused for six hours, then
refreshed and overwritten. If an upstream refresh fails, existing stored series
are returned as stale instead of removing the chart.

The history tier dropdown offers Near Mint, Lightly Played, Moderately
Played, Heavily Played, and Damaged. Raw histories retain both TCGPlayer and
eBay sources and use averages, with no minimum sales requirement. Additional raw
conditions share the per-card/tier cache in `poketrace_graded_price_history`;
Near Mint stays on the card row. A valid raw condition may have no history for a
particular card.

The dropdown also offers whole-number graded eBay tiers with at least
15 sales, an available price, and a valid `lastUpdated` within the last two
calendar months (inclusive of the cutoff date, using UTC and clamping month ends).
Missing, invalid, or future update dates are excluded. When `gradedOptions` is
present, the tier must also be advertised there. Older records without that
metadata use their valid graded price keys. Half grades are excluded from history requests and dropdown
options; their price tiles remain subject to the graded-price display rules.
Selecting a tier requests its first all-time history page on demand, with the
same local period filters. Graded charts render `avg`; when the upstream graded
average is missing, the server currently substitutes `median7d` into that field.
Selecting a grade retains the Near Mint TCGPlayer and eBay lines and adds the
graded eBay history as a third, blue line. Raw-condition selections display only
that condition's sources. Each card/tier pair has an independent six-hour cache
in `poketrace_graded_price_history`; the server enforces the same eligibility
rules before fetching or serving a graded cache. The demo route fetches the source card and its price history normally; only
feature-analysis responses come from `demo-card.json`.

Sealed-product charts request the first all-time page of `UNOPENED` history with
the same 365-row limit and no pagination. Their six-hour cache stays on the
sealed-product row. Existing 90-day caches refresh on the next history request,
even if still within their TTL; if refresh fails, the previous data remains
available as stale. The browser uses the same 1M, 3M, 6M, and All period controls.

Before period filtering, each series excludes a single highest price point
when it is at least four times the next-highest positive price in that same
series. This affects chart rendering and its sold count, not stored history.
The legend below the chart sums available counts from retained points in the
selected period. The price axis selects four or five horizontal grid lines and supports
fractional intervals and decimal labels for low prices.

The graded-price box below the graph hides tiers whose numeric `median3d`,
`median7d`, and `median30d` are all equal. Grading-opportunity generation excludes
PSA 10 prices matching the same rule before ranking and limiting results.
Missing medians alone do not trigger this exclusion. This rule does not remove
history dropdown options.

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
