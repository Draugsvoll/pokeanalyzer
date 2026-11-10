# PokeTrace catalogue and daily prices

## V2 database

The app and all PokeTrace import, refresh, and generation commands use
`POKETRACE_DATABASE_URL_V2` and `POKETRACE_DATABASE_AUTH_TOKEN_V2` exclusively.
The upstream card, catalog, and history requests use `/v2`. There is no v1
database fallback or v1 response conversion. For a local database, explicitly set
`POKETRACE_DATABASE_URL_V2=file:server/db/poketrace-v2.sqlite`; no database target
is chosen automatically.

Bootstrap a new v2 database with:

```sh
npm run poketrace:setup-v2
```

This migrates the empty database, copies only the four market snapshot tables
from v1, imports fresh singles and sealed products, and generates catalogs,
filter options, market categories, and the grading-opportunity list. The snapshot
copy reads the old `POKETRACE_DATABASE_URL` and `POKETRACE_DATABASE_AUTH_TOKEN`;
no other command uses those credentials. It copies `poketrace_market_snapshots`,
`poketrace_tcg_market_prices`, `poketrace_sealed_market_snapshots`, and
`poketrace_sealed_tcg_market_prices`. Existing target observations win on reruns.
No saved analyses, listings, card JSON, history caches, generated payloads, or
import checkpoints are copied. Imports save a new checkpoint after each page.
Quota exhaustion stops setup with a failure status and preserves completed work.

Complete v2 card responses are stored directly in `raw_json`, including
`markets` and the native `prices.<tier>.<market>.<source>` structure. US and EU prices stay on the same
card row in their native currencies. US snapshots and calculations read the
native US price paths directly. Only the existing UI card model projects US
prices into its source-first props; its `marketPrices` field exposes native prices for market controls. Import also records the
initial daily snapshots and comparisons. Browser caches have a separate v2
namespace. The old database's maintenance lock is independent from v2's lock.

Run this command on the v2 daily cron service:

```sh
npm run poketrace:refresh-v2-daily
```

The web and cron services must share the v2 database credentials. Keep the old
deployment and its jobs on the old release and credentials for manual rollback;
changing the database URL alone does not make this implementation read v1 data.
Both deployments share the upstream account quota. `POKETRACE_REQUEST_GAP_MS`
controls pacing for singles imports/refreshes and sealed imports. Catalog warmup
requests use `POKETRACE_CATALOG_REFRESH_URL_V2`,
`POKETRACE_SEALED_CATALOG_REFRESH_URL_V2`, and
`POKETRACE_CATALOG_REFRESH_TOKEN_V2`, pointing only to the v2 web service.

The history US/EU controls select the market passed to the upstream history
endpoint with `period=1y`, which is supported by the Pro account. Raw conditions retain their source's averages, and whole graded tiers
prefer `median30d`. EU graded eligibility uses the selected market's
`cardmarket_unsold` prices and counts. CardMarket counts describe listings, not
sold transactions. Current price cards and grading calculations remain US-based.
The UI does not perform currency conversion.

Each history cache stores separate `US` and `EU` entries inside its existing JSON
column. Every entry has its own six-hour timestamp; atomic JSON updates preserve
the other market. Pending requests and browser page caches include the card,
market, and tier. Responses from another card, market, or tier are rejected.
Only the first one-year page is fetched (up to 365 rows); pagination is unchanged.
The live v2 API restricts `period=all` to Scale/Business. The chart's All control
shows all returned data within that request's coverage, not lifetime history.
Sealed history uses the same market separation on its product row.

For local development, add `POKETRACE_API_KEY=...` and an explicit
`POKETRACE_DATABASE_URL_V2` to `.env`, then run:

```sh
npm run poketrace:import-catalog
npm run start
```

The import saves 20 English Pokémon singles from the US market in
`server/db/poketrace-v2.sqlite`. Continue the same checkpoint through the full
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
`avg` with the eBay PSA 10 `median30d`. The Near Mint price used in calculations
is the same price displayed on the card. Cards missing either positive price
are excluded, with no PSA 10 fallback. A card qualifies when both sale counts
are at least 40, both prices were updated within the last 30 days, and the PSA 10
median is at least $350 higher when the raw price is below $50, or at least
$450 higher when the raw price is $50 or more. The top 12 are ranked by the PSA 10 30-day
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

Opening a card requests the first page of one-year `NEAR_MINT` history (up to
365 rows, without pagination). The chart offers local period
controls: **1M** (30 days), **3M** (90 days), **6M** (180 days), and **All**
(all available returned history). Longer options appear only when the displayed
series contain history older than the preceding period: 30, 90, or 180 days,
respectively. If the selected period becomes unavailable, the longest available
period is selected. There is no 365-day option. The All view includes the year on dates
from previous years. Available rows are grouped into their marketplace series
and stored in the selected market's entry on the card row. Each market's cache
is reused for six hours, then
refreshed and overwritten. If an upstream refresh fails, existing stored series
are returned as stale instead of removing the chart.

The history tier dropdown offers Near Mint, Lightly Played, Moderately
Played, Heavily Played, and Damaged. Raw histories retain both TCGPlayer and
eBay sources and use averages, with no minimum sales requirement. Additional raw
conditions share the per-card/tier cache in `poketrace_graded_price_history`;
Near Mint stays on the card row. A valid raw condition may have no history for a
particular card. EU conditions use CardMarket listing history in EUR.

The dropdown also offers whole-number graded eBay tiers with at least
15 sales, an available price, and a valid `lastUpdated` within the last two
calendar months (inclusive of the cutoff date, using UTC and clamping month ends).
Missing, invalid, or future update dates are excluded. When `gradedOptions` is
present for US, the tier must also be advertised there. EU tiers are qualified
directly from native `prices` for that market. Half grades are excluded from history requests and dropdown
options; their price tiles remain subject to the graded-price display rules.
Selecting a tier requests its first one-year history page on demand, with the
same local period filters. Graded charts resolve returned points using the shared
price priority: `median30d`, then `median7d`, then `avg`. When the upstream graded average is missing, the server
uses `median30d` to retain the point. Raw-condition charts continue to use averages.
Selecting a grade retains the Near Mint TCGPlayer and eBay lines and adds the
graded eBay history as a third, blue line. Raw-condition selections display only
that condition's sources. Each card/market/tier combination has an independent six-hour cache
in `poketrace_graded_price_history`; the server enforces the same eligibility
rules before fetching or serving a graded cache. The demo route fetches the source card and its price history normally; only
feature-analysis responses come from `demo-card.json`.

Sealed-product charts request the first one-year page of `UNOPENED` history with
the same 365-row limit and no pagination. Their six-hour cache stays on the
sealed-product row, separated by market. If refresh fails, the same market's
previous data remains available as stale. The browser uses the same 1M, 3M,
6M, and All period controls.

Before period filtering, each series excludes a single highest price point
when it is at least four times the next-highest positive price in that same
series. This affects chart rendering and its sold count, not stored history.
The legend below the chart sums available counts from retained points in the
selected period. The price axis selects four or five horizontal grid lines and supports
fractional intervals and decimal labels for low prices.

Graded-price boxes, grading calculator prefills, and graded graph lines use
`resolveGradedPrice` in `shared/gradedPrice.ts`: prefer `median30d`, then
`median7d`, then `avg`. The first finite, nonnegative numeric value is used;
missing or invalid values fall through to the next field. Raw-condition prices
continue to use averages.

Graded-price boxes and calculator prefills also share `isEligibleGradedPrice`:
the tier must have a finite numeric `saleCount` of at least 15, and its numeric
`median3d`, `median7d`, and `median30d` must not all be equal. Missing medians
alone do not trigger this exclusion. Ineligible grades are hidden from the
boxes and are not imported into calculator inputs; users can still enter
calculator prices manually. The history dropdown retains its separate rules
described above, including its update-age requirement; the identical-median
exclusion does not remove history options.

Grading-opportunity generation separately excludes PSA 10 prices with three
identical medians before ranking and limiting results. It retains its own
30-day-median-only pricing and qualification thresholds described above.

Import and refresh share a database lock. If either job is already running, the
other skips its run successfully. A daily quota stop preserves all completed
cards and exits with a failure status so the cron execution is visibly
incomplete.

For deployment, set `POKETRACE_DATABASE_URL_V2` and
`POKETRACE_DATABASE_AUTH_TOKEN_V2` on both the web and cron services. They must use
the same libSQL database; a local SQLite file cannot be shared between separate
Railway services.

PokeTrace's free plan is for personal use; commercial deployment needs a paid
plan under its published pricing.
