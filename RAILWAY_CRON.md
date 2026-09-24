# Railway cron jobs

Use separate Railway services for scheduled scripts. Each service should point at
this repo, run one npm script as its Start Command, and have a Cron Schedule set
in Railway service settings.

Railway cron schedules use UTC and require at least 5 minutes between runs.
Cron services must finish and exit; the scripts close the shared database client
after direct CLI runs so Railway can mark the execution complete.

The news script uses a database-backed lock named `scheduled-maintenance`.
PokeTrace maintenance uses its own `poketrace-maintenance` lock in the PokeTrace
database.

## News generation

Start Command:

```sh
npm run news:generate
```

Suggested Cron Schedule:

```text
30 10 * * 6
```

This runs weekly on Saturday at 10:30 UTC, which is 12:30 in Norwegian summer
time.

## PokeTrace daily prices

Start Command:

```sh
npm run poketrace:refresh-daily
```

Suggested Cron Schedule:

```text
0 1 * * *
```

This refreshes the cards with the oldest successful price update first. Each
successful card is moved to the back of the queue and receives compact daily
price history containing only its TCGPlayer Near Mint market price. Failed cards
receive a bounded retry delay and do not block the rest of the queue.
The same refresh stores ready-to-read 1-day, 7-day, and 30-day comparisons on
the card row, using an exact snapshot or the nearest allowed date within one
day. It also writes a supplemental `poketrace_market_snapshots` row containing
the complete TCGPlayer and eBay Near Mint, Lightly Played, Moderately Played,
and Damaged objects returned by PokeTrace. Conditions that PokeTrace does not
return are omitted, missing sources are stored as `NULL`, and no locally
calculated market values are added.
Supplemental snapshots older than 35 days are removed automatically.

Set `POKETRACE_DAILY_CARD_LIMIT` to the maximum number of cards for one run.
The default and maximum are 50,000, which covers the whole current catalogue.
Set
`POKETRACE_PRICE_HISTORY_RETENTION_DAYS` to control retention; the default is 40
days and the minimum is 31 for the existing TCGPlayer price history. The
supplemental market snapshot retention is fixed at 35 days.
`POKETRACE_REQUEST_GAP_MS` defaults to 2,100 ms for the free-tier burst limit
and can be lowered to match a paid plan.

## Market categories

Start Command:

```sh
npm run poketrace:generate-market-categories
```

This independent job generates every category configured in
`server/config/marketCategories.ts` and upserts the complete payload as one row
in the shared PokeTrace database. Give it its own cron schedule; it is not
automatically coupled to the daily price refresh. The web service reads the same
row through `GET /api/market-categories`, so the cron and web services must use
the same PokeTrace database variables.

The browser stores the complete response for 24 hours. A missing, expired, or
invalid browser cache is replaced from the server.

## Required variables

Set the production variables each cron service needs:

```text
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
XAI_API_KEY
POKETRACE_API_KEY
POKETRACE_DATABASE_URL
POKETRACE_DATABASE_AUTH_TOKEN
```

`news:generate` needs the main database variables and `XAI_API_KEY`.
The PokeTrace cron and web service must share the same
`POKETRACE_DATABASE_URL` and `POKETRACE_DATABASE_AUTH_TOKEN`; otherwise the cron
will update a separate local SQLite file that the web service cannot read.

Do not set `ALLOW_LOCAL_DATABASE` on Railway cron services. The scripts require
an explicit remote database target in production-like environments.

## Quick manual checks

Before enabling the schedules, run these once from the Railway service shell or
as one-off deployments:

```sh
npm run news:generate:dry-run
```

If the dry runs finish and the processes stop, enable the cron schedules.
