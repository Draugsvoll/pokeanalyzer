# TCG listings & sold

TCG uses CompSniper with server-only `COMPSNIPER_API_KEY`. eBay also uses CompSniper with the same server-only key. Optional endpoint overrides: `COMPSNIPER_TCG_SALES_API_URL` and `COMPSNIPER_TCG_LISTINGS_API_URL`; these must implement the CompSniper contract.

The search UI always requests English and all conditions; condition buttons filter the fetched results locally, and there is no language selector. The server rejects non-English requests.

An explicit `POST /tcg?stream=1` search reserves one shared credit, starts two provider calls concurrently, and streams NDJSON started/result/failure/complete events using the same reader as eBay. Each result renders immediately; the other side remains pending. The header hides once a usable side arrives, and reappears on failure for retry. Complete failures refund; disconnecting after a successful result does not refund. Cached searches still reserve one credit and stream both stored sides without provider calls.

The provider requests are:

- `https://api.compsniper.com/v1/tcgplayer/sold`: exact stored productId, language, condition label (omitted for All), count=250, history=none.
- `https://api.compsniper.com/v1/tcgplayer/listings`: same identity/filters, count=50, page=1.

Both responses must identify the requested product. No variant filter is sent: all printings belonging to the exact product are included. Rows are validated and checked for English and the requested condition. TCG uses condition buttons styled like the eBay grade row, without a grading-company dropdown or keyword fields. `shipping` maps to shippingPrice, `soldAt` to soldDate, and listing `variant` to printing. Missing prices are rejected, never interpreted as free. Seller location, sales, rating, Gold, Verified and Direct status appear when supplied.

The UI shows the bounded returned sample, not all historical sales or all inventory. Sorting and summaries operate on those rows, excluding shipping; quantities are shown separately and do not multiply prices. No additional pages or price-history buckets are requested automatically. The product link leads to TCGplayer, not an individual transaction.

The existing shared marketplace allowance is unchanged: one user credit per search (two provider requests on cache misses). Complete failure refunds; partial usable results and valid empty results count as a search. Local sorting, view controls and condition filters do not charge. Configuration is checked before credit reservation.

Requests time out after 30 seconds. Complete snapshots are cached under `saved_responses.tcg_listings` and exposed as `card.tcg_listings`. The `reuseDays` variable in `server/tcg/store.ts` defaults to 2 days, matching eBay. Cache identity checks product/printing/condition/language; expired, future-dated, or partial results are not reused. Each save updates only its JSON path, preserving eBay and AI data; catalog refreshes preserve saved responses. No schema migration is needed. All Pokemon US printings are supported. Snapshots use printing="all", so previous single-printing cache entries are not reused.

Tests mock the documented response contract and consume no provider quota. Two live requests on October 28, 2026 verified HTTP 200 and the documented sold/listings field shapes for product 246723. This verifies the integration contract, not the accuracy of upstream prices.

Reference: https://compsniper.com/docs/tcgplayer

## eBay explorer

eBay searches use the fixed CompSniper endpoint `https://api.compsniper.com/v1/scrape` and `COMPSNIPER_API_KEY`; the old `EBAYCOMPS_*` configuration is unused. No Sold Comps credentials or endpoint overrides are used.

Both sold and active searches request page 1 with count 240, ebay.com, card category 183454, conditionId 2750 (graded), relevance=true and exactMatch=false. Sold searches enable bestOfferPrice=true (ignored by CompSniper for active searches). Pagination is not automatic: each side fetches one page.

The frontend prefers a positive finite acceptedOfferPrice only when bestOfferAccepted=true and acceptedOfferPriceStatus=found, otherwise soldPrice. Sorting and summaries use that same price. Results priced at 1 or less are excluded from the frontend, and unresolved accepted offers show "Offer accepted — open sale for final price". Existing saved results retain the two-day cache duration.

References: https://api.compsniper.com/docs/api-reference and https://api.compsniper.com/docs/best-offer-prices
