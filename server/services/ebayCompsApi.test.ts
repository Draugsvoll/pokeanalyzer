import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";
import {
  buildEbayCardRequests,
  buildEbayCompsUrl,
  fetchEbayComps,
  filterEbayCompsResponseByTitle,
} from "./ebayCompsApi.js";

test("eBay card requests preserve the sold and active request contract", () => {
  const { query, soldOptions, activeOptions } = buildEbayCardRequests({
    cardName: "Charizard ex",
    cardNumber: "004/102",
  });

  assert.equal(query, "Charizard ex 004/102");
  assert.deepEqual(soldOptions, {
    titleFilter: { cardName: "Charizard ex", cardNumber: "004/102" },
  });
  assert.deepEqual(activeOptions, {
    titleFilter: { cardName: "Charizard ex", cardNumber: "004/102" },
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
    assert.equal(requestUrl.searchParams.has("aspectFilter"), false);
    assert.equal(
      requestUrl.searchParams.get("sold"),
      listingType === "active" ? "false" : null,
    );
  }
});

test("eBay card requests use only the name when the card has no number", () => {
  const { query } = buildEbayCardRequests({
    cardName: "Charizard",
    cardNumber: "",
  });

  assert.equal(query, "Charizard");
});

test("eBay comps keep titles with either the number or first name token", () => {
  const matching = [
    { title: "Pokemon Mew Holo" },
    { title: "Pokemon 008/102 Holo" },
    { title: "MEW ex 008/102" },
  ];
  const response = filterEbayCompsResponseByTitle(
    {
      items: [
        ...matching,
        { title: "Pokemon Base Set Mewtwo 10/102 Holo" },
        { title: "Pokemon Base Set Charizard 4/102 Holo" },
        { title: "Pokemon ex 8/102 Holo" },
        { title: "" },
        { title: 8 },
        null,
        {},
      ],
      totalItems: 10,
    },
    { cardName: "Mew ex", cardNumber: "008/102" },
  ) as { items: unknown[]; totalItems: number };

  assert.deepEqual(response.items, matching);
  assert.equal(response.totalItems, matching.length);
});

test("eBay comps title matching ignores punctuation and accents", () => {
  const response = filterEbayCompsResponseByTitle(
    {
      items: [{ title: "Ho Oh Pokemon Card" }, { title: "Flabebe Pokemon" }],
    },
    { cardName: "Ho-Oh", cardNumber: "" },
  ) as { items: unknown[] };

  assert.equal(response.items.length, 1);
  const accented = filterEbayCompsResponseByTitle(
    { items: [{ title: "FLABEBE Pokemon" }] },
    { cardName: "Flabébé", cardNumber: "" },
  ) as { items: unknown[] };
  assert.equal(accented.items.length, 1);
});

test("empty match criteria do not match every title", () => {
  const response = filterEbayCompsResponseByTitle(
    { items: [{ title: "Pikachu" }] },
    { cardName: "", cardNumber: "" },
  ) as { items: unknown[] };
  assert.deepEqual(response.items, []);
});

test("fresh sold and active responses use the same title filter", async (t) => {
  const previousKey = process.env.EBAYCOMPS_API_KEY;
  process.env.EBAYCOMPS_API_KEY = "test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.EBAYCOMPS_API_KEY;
    else process.env.EBAYCOMPS_API_KEY = previousKey;
  });
  const matching = [{ title: "Charizard Holo" }, { title: "Card SVP001" }];
  t.mock.method(globalThis, "fetch", async () =>
    new Response(
      JSON.stringify({
        items: [...matching, { title: "Unrelated Pikachu" }],
      }),
    ),
  );
  const { query, soldOptions, activeOptions } = buildEbayCardRequests({
    cardName: "Charizard ex",
    cardNumber: "svp001",
  });
  for (const options of [soldOptions, activeOptions]) {
    const result = await fetchEbayComps(query, undefined, options);
    assert.deepEqual(result, { items: matching, totalItems: 2 });
  }
});
