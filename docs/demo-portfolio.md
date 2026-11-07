The logged-out `/portfolio` page offers an **Explore demo portfolio** link below
the login container, opening
`/portfolio/demo`. The same portfolio view displays a read-only collection and
watchlist, each containing 20 different cards across several sets and eras.

The fixed IDs are maintained in `shared/demoPortfolio.ts`. The public,
rate-limited `GET /api/portfolio/demo?list=collection|watchlist` endpoint uses the
normal portfolio loader to batch-load current card prices and comparison
snapshots. Responses can be cached for five minutes. It reads the local catalogue
and does not request upstream market data or access a user's saved lists.

Filtering, sorting, period comparisons, and card navigation work normally.
Adding, removing, and changing quantities are unavailable in demo mode. Demo
collection and watchlist load together when the demo opens. Both lists stay in
page state and never replace a signed-in user's portfolio cache.
