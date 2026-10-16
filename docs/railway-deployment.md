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

## Service commands

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
