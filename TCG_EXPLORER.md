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

Both sold and active searches request page 1 with count 240, ebay.com, card category 183454, conditionId 2750 (Graded) or 4000 (Raw), relevance=true and exactMatch=false. Sold searches enable bestOfferPrice=true (ignored by CompSniper for active searches). Pagination is not automatic: each side fetches one page.

The frontend prefers a positive finite acceptedOfferPrice only when bestOfferAccepted=true and acceptedOfferPriceStatus=found, otherwise soldPrice. Sorting and summaries use that same price. Results priced at 1 or less are excluded from the frontend, and unresolved accepted offers show "Offer accepted — open sale for final price". Existing saved results retain the two-day cache duration.

References: https://api.compsniper.com/docs/api-reference and https://api.compsniper.com/docs/best-offer-prices

Before a successful response, eBay's feature header contains the Raw/Graded selector and fetch button. Successful responses, including empty results, hide the header and move Raw/Graded into the results controls: right-aligned beside the centered Sold/Listed toggle in Single view, and centered in Dual view. The controls stack when space is limited. Switching to a mode without a successful response brings back the header; errors also restore it so partial failures can be retried. Selecting a mode does not search or spend a credit. Each mode keeps its own results, filters, sorting and Single/Dual view state while switching modes or feature tabs; opening a different card/account resets it. Graded remains the initial selection.

Graded saves use the existing `saved_responses.ebay` field; Raw uses `saved_responses.ebay_raw`. Both share `reuseDays` in `server/db/ebayStore.ts`, with separate saved timestamps. Raw never reuses graded/legacy results. No database migration is required. Provider conditionId is the only raw/graded request filter; no keyword exclusions or aspectFilter are added.

Raw shows local condition filters using explicit condition names/abbreviations from the listing condition or title. Unspecified conditions remain visible under All. Graded keeps grade/company filters.

Graded view shows only matching grades from 1–10, with counts from the fetched results. Grades always use a dropdown. The company dropdown also shows only companies with matches and includes counts. All and All companies have no count. Half grades belong to their matching whole-grade filter. Grade and company counts respect keyword filters but ignore both selected grade and company. Counts appear only in dropdown options; selected dropdown labels omit counts. Grade options descend from 10 to 1, after All. Single view counts the selected Sold/Listed side; Dual combines both sides. Unavailable selections fall back to All or All companies. Counts are memoized in component memory and reset with the card/account; they do not trigger API requests or use browser storage.

The demo uses live card details/prices and saved `ebay`/`ebay_raw` responses from `public/demo-card.json`, without age checks or paid searches. The existing demo export script includes both saved fields when present. If no Raw response has been saved/exported, the demo says so instead of searching or borrowing Graded results.

Both eBay and TCG explorer provider 429 errors show "Experiencing issues right now. Please try again later." and disable fetching for 15 seconds. Raw and Graded share that eBay cooldown.
