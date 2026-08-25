import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";
import {
  buildEbayCardRequests,
  buildEbayCompsUrl,
  filterEbayCompsResponseByTitle,
} from "./ebayCompsApi.js";

test("eBay card requests preserve the sold and active request contract", () => {
  const { query, soldOptions, activeOptions } = buildEbayCardRequests({
    cardName: "Charizard",
    cardNumber: "4",
    formattedCardNumber: "004/102",
    setName: "Base Set",
    unpaddedCardNumber: "4/102",
  });

  assert.equal(query, "Charizard (004/102,4/102,4) Base Set");
  assert.deepEqual(soldOptions, {
    aspectFilter: { Set: "Base Set" },
    requiredTitle: "Charizard",
  });
  assert.deepEqual(activeOptions, {
    aspectFilter: { Set: "Base Set" },
    requiredTitle: "Charizard",
    sold: false,
  });

  for (const [listingType, options] of [
    ["sold", soldOptions],
    ["active", activeOptions],
  ] as const) {
    const requestUrl: URL = new URL(
      buildEbayCompsUrl(
        "https://api.sold-comps.com/v1/scrape",
        "keyword",
        query,
        options,
      ),
    );

    assert.equal(requestUrl.searchParams.get("keyword"), query);
    assert.equal(requestUrl.searchParams.get("categoryId"), "183454");
    assert.deepEqual(
      JSON.parse(requestUrl.searchParams.get("aspectFilter") ?? ""),
      { Set: "Base Set" },
    );
    assert.equal(
      requestUrl.searchParams.get("sold"),
      listingType === "active" ? "false" : null,
    );
  }
});

test("eBay comps keep only titles containing the card name", () => {
  const response = filterEbayCompsResponseByTitle(
    {
      items: [
        { title: "Pokemon Base Set Mew 8/102 Holo" },
        { title: "Pokemon Base Set Mewtwo 10/102 Holo" },
        { title: "Pokemon Base Set Charizard 4/102 Holo" },
      ],
      totalItems: 3,
    },
    "Mew",
  ) as { items: unknown[]; totalItems: number };

  assert.equal(response.items.length, 1);
  assert.equal(response.totalItems, 1);
});

test("eBay comps title matching ignores punctuation and accents", () => {
  const response = filterEbayCompsResponseByTitle(
    {
      items: [{ title: "Ho Oh Pokemon Card" }, { title: "Flabebe Pokemon" }],
    },
    "Ho-Oh",
  ) as { items: unknown[] };

  assert.equal(response.items.length, 1);
});
