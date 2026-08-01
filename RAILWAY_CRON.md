# Railway cron jobs

Use separate Railway services for scheduled scripts. Each service should point at
this repo, run one npm script as its Start Command, and have a Cron Schedule set
in Railway service settings.

Railway cron schedules use UTC and require at least 5 minutes between runs.
Cron services must finish and exit; the scripts close the shared database client
after direct CLI runs so Railway can mark the execution complete.

The scheduled scripts use one shared database-backed lock named
`scheduled-maintenance`. This prevents duplicate runs of the same job and also
prevents `sync:cards` and `news:generate` from running at the same time.

## Card sync

Start Command:

```sh
npm run sync:cards
```

Suggested Cron Schedule:

```text
15 2 * * *
```

This runs daily at 02:15 UTC.

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

## Required variables

Set the same production variables on both cron services that the scripts need:

```text
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
POKEMON_TCG_API_KEY
XAI_API_KEY
```

`news:generate` needs `XAI_API_KEY`. `sync:cards` needs the database variables
and should use `POKEMON_TCG_API_KEY` when available.

Do not set `ALLOW_LOCAL_DATABASE` on Railway cron services. The scripts require
an explicit remote database target in production-like environments.

## Quick manual checks

Before enabling the schedules, run these once from the Railway service shell or
as one-off deployments:

```sh
npm run db:check
npm run sync:cards:dry-run
npm run news:generate:dry-run
```

If the dry runs finish and the processes stop, enable the cron schedules.
