# Railway deployment

## Firebase App Check (frontend)

Set the public Enterprise site key on `pokelyzer-frontend` before building:

```env
VITE_FIREBASE_APPCHECK_SITE_KEY=6Lequ_AtAAAAAKqbRqq-f4wZAESjG45gYN9gbHYb
```

Rebuild and redeploy after changing this variable. Vite rejects frontend builds
when the key is missing, empty, or whitespace-only. When configured, App Check
initializes before Authentication and Firestore and automatically refreshes tokens.
The backend runtime does not need the key; any service that runs the frontend
build must provide it at build time.

In the Enterprise key settings, authorize the website hostnames that actually
run the frontend (for example, `pokelyzer.com` and `www.pokelyzer.com`), not just
the `auth.pokelyzer.com` authentication handler. Keep Authentication and Firestore
in App Check **Monitoring** while testing email signup/login, Google login, and
profile access. Check that requests from the new deployment are verified before
enabling enforcement. This integration does not enforce App Check on the custom
Railway API.

For local development (`npm run dev`), the site key is optional. Without it,
App Check is disabled locally. Firebase enforcement still applies: login or
database requests will fail without a valid token if the service enforces App Check.
To use enforced services locally, set the same site key in `.env` and register
the debug token printed in the browser console under App Check > Apps > Manage
debug tokens. Treat that generated token as a secret; do not commit or share it.
Production builds do not enable debug mode. Running `npm run build` locally
still requires the site key.

See [Firebase's Enterprise setup guide](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)
and [debug provider guide](https://firebase.google.com/docs/app-check/web/debug-provider).

## Independent v1 and v2 services

Keep the existing v1 backend, frontend, cron services, variables, domains, and
database unchanged. Pin those services to the last working v1 release and disable
automatic deployments from the branch receiving v2 changes. The old npm command
names in this release execute v2 code; keeping their names does not preserve v1.
Rollback requires the previous application release as well as its database.

Create new services from the v2 release with separate names:

| New Railway service     | Start command                              | Pre-deploy command                |
| ----------------------- | ------------------------------------------ | --------------------------------- |
| `pokelyzer-backend-v2`  | `npm run server:v2`                        | `npm run db:migrate:poketrace:v2` |
| `card-sync-v2`          | `npm run poketrace:v2:refresh-daily`       | None                              |
| `categories-fetch-v2`   | `npm run poketrace:v2:generate-categories` | None                              |
| `catalog-warmup-v2`     | `npm run poketrace:v2:warm-catalogs`       | None                              |
| `pokelyzer-frontend-v2` | `npm run start:prod`                       | None                              |

The frontend needs `npm run build`; its build-time `VITE_API_URL` must point to
the v2 backend domain. Configure `APP_URL` / `CORS_ALLOWED_ORIGINS` on the v2
backend for the v2 frontend. Use separate temporary domains for testing; leave
the v1 domains intact until cutover. These commands and instructions do not
create or change hosted Railway services automatically.

The existing primary/account database must already be migrated. The v2 backend
pre-deploy command intentionally migrates only the new PokeTrace database.
Account, billing, and news resources are still shared; this isolates the
PokeTrace migration, not the entire account system. Keep the existing Stripe
webhook destination and news cron unchanged.

Give the v2 backend, card sync, and categories services only
`POKETRACE_DATABASE_URL_V2` and `POKETRACE_DATABASE_AUTH_TOKEN_V2` for PokeTrace
database access. Do not copy the old database credentials into these services.
Only the one-time snapshot-copy command needs both sets of credentials. Leave
the old credentials on the pinned v1 services.

The v2 warmup service needs only `POKETRACE_CATALOG_REFRESH_URL_V2`,
`POKETRACE_SEALED_CATALOG_REFRESH_URL_V2`, and
`POKETRACE_CATALOG_REFRESH_TOKEN_V2`. Both URLs must target the v2 backend, and
the token must match the v2 backend's token and differ from the v1 token.
Do not reference the old backend's domain or warmup token.

Schedule v2 jobs separately: run card sync, then categories after sync finishes,
then warmup after publication. They have a database-local maintenance lock and
cannot block v1 maintenance. The upstream API key still shares its quota and
burst limit across services if the same key is used; stagger v1/v2 imports and
refreshes. Singles and sealed refreshes default to a 400 ms request gap.

Do not also schedule the combined `poketrace:refresh-v2-daily` command alongside
these separate sync/categories services. Alternatively, replace both with one
combined daily service, then warm its catalogs after it succeeds.

Keep the v1 frontend/backend pair available for rollback. Reverting traffic to
that pair restores v1 without copying v2 data into the old database. Do not rerun
`poketrace:setup-v2` as a recurring job; setup/import is a one-time operation.

## Existing v1 service commands (previous release only)

The backend uses Railway's **Pre-deploy Command** so its databases are migrated
before a new deployment starts:

| Railway service     | Pre-deploy command   | Database |
| ------------------- | -------------------- | -------- |
| `pokelyzer-backend` | `npm run db:migrate` | Both     |

Railway does not expose the same pre-deploy setting for the scheduled services
in this project. Configure each cron service with the following complete
**Start Command** instead:

| Railway service    | Start command                                                                  | Database     |
| ------------------ | ------------------------------------------------------------------------------ | ------------ |
| `categories:fetch` | `npm run db:migrate:poketrace && npm run poketrace:generate-market-categories` | PokeTrace    |
| `card:sync`        | `npm run db:migrate:poketrace && npm run poketrace:refresh-all-daily`          | PokeTrace    |
| `news:generate`    | `npm run db:migrate:primary && npm run news:generate`                          | Primary/news |

`pokelyzer-frontend` does not use a database and needs no migration command.

The backend command requires credentials for both database targets. Each cron
service only needs credentials for the database listed above. A failed backend
migration prevents the new backend deployment from starting. A failed cron
migration prevents the command after `&&` from running, so that scheduled job
fails without executing against an incompatible schema.

The table above describes the pinned v1 release, not commands to run from the
v2 release. Initialize the new database once with `npm run poketrace:setup-v2`
before routing traffic to v2. The new release never falls back to the old
database.

For a single v2 daily cron, use
`npm run db:migrate:poketrace && npm run poketrace:refresh-v2-daily`.
This refreshes singles and sealed, then generates categories and the complete
grading-opportunity list. Do not also run a separate category cron at the same
time. Optional catalog warmups must target the v2 backend using the
`POKETRACE_CATALOG_REFRESH_URL_V2`, `POKETRACE_SEALED_CATALOG_REFRESH_URL_V2`,
and `POKETRACE_CATALOG_REFRESH_TOKEN_V2` settings.

The PokeTrace migration creates the published Sealed catalog store but does not
populate it. A complete Sealed import or daily refresh validates and atomically
publishes the first catalog, and later completed runs replace it. Until one of
those jobs succeeds, no Sealed search catalog is available.

Railway provides `RAILWAY_ENVIRONMENT_ID` to running deployments. The
application uses that marker to skip development-only runtime PokeTrace schema
initialization. This keeps API cold starts free of migration queries; cron jobs
perform their explicit migration check before each scheduled task.

## Primary database migrations

Primary migrations live in `server/db/migrations/primary` and are registered in
`server/db/primaryDatabaseMigrations.ts`. Migration `001` is the legacy schema
baseline and migration `002` removes the obsolete news feed. To change the
primary schema, add the next numbered SQL file and registry entry; never edit or
reorder an applied migration. The runner stores and verifies each migration's
SHA-256 checksum, applies pending versions inside a serialized write
transaction, and records a version only when its SQL and schema validation
succeed. Keep `EXPECTED_PRIMARY_TABLES` in
`server/db/migratePrimaryDatabase.ts` aligned with the schema produced by the
latest migration.
