# Railway deployment

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
| `card:sync`        | `npm run db:migrate:poketrace && npm run poketrace:refresh-daily`              | PokeTrace    |
| `news:generate`    | `npm run db:migrate:primary && npm run news:generate`                          | Primary/news |

`pokelyzer-frontend` does not use a database and needs no migration command.

The backend command requires credentials for both database targets. Each cron
service only needs credentials for the database listed above. A failed backend
migration prevents the new backend deployment from starting. A failed cron
migration prevents the command after `&&` from running, so that scheduled job
fails without executing against an incompatible schema.

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
