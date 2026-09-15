# PokeTrace local catalogue trial

Add `POKETRACE_API_KEY=...` to `.env`, then run:

```sh
npm run poketrace:import-catalog
npm run start
```

The import saves 20 English Pokémon singles from the US market in
`server/db/poketrace.sqlite`. Open `/poketrace-search` to search the local SQL
database and inspect a saved card. To continue the same checkpoint through the
full English US single-card catalogue:

```sh
npm run poketrace:import-catalog -- all
```

To import one known PokeTrace card UUID instead:

```sh
npm run poketrace:import-card -- <card-uuid>
```

The list API returns at most 20 cards per request. The import spaces requests by
2.1 seconds for the free-tier burst limit. It saves the cursor and cards together
after each page, so rerunning the command resumes where it stopped, including
after a daily API limit is reached. A daily-limit stop exits successfully;
short burst limits are retried before the job fails.

Refresh the 50 oldest imported cards with:

```sh
npm run poketrace:refresh-oldest
```

The refresher groups cards with TCGPlayer IDs into lookups of up to 20 IDs and
uses individual requests for cards without a usable reference. It only marks
cards as refreshed after receiving and saving new data. PokeTrace does not
document a general batch-by-PokeTrace-ID route in its public OpenAPI contract.
Import and refresh share a database lock. If either job is already running,
the other skips its run successfully.

This trial has its own database, API routes and UI. The legacy catalogue and
PkmnPrices trial remain available. PokeTrace's free plan is for personal use;
commercial deployment needs a paid plan under its published pricing.
