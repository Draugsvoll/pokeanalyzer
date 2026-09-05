import assert from "node:assert/strict";
import test from "node:test";
import { acceptsGzip, toCatalogCard } from "./cardCatalog.js";

test("catalog card includes overview and TCGPlayer data only", () => {
  const card = JSON.parse(
    JSON.stringify(
      toCatalogCard({
        id: "base1-4",
        name: "Charizard",
        number: "4",
        rarity: "Rare Holo",
        artist: "Mitsuhiro Arita",
        flavorText: "Spits fire that is hot enough to melt boulders.",
        attacks: [{ name: "Fire Spin" }],
        set: { id: "base1", name: "Base", series: "Base" },
        images: { small: "small.png", large: "large.png" },
        tcgplayer: { prices: { holofoil: { market: 300 } } },
        cardmarket: { prices: { trendPrice: 250 } },
        justtcg: { prices: { variant: { market: 275 } } },
        grok: { price_analysis: { private: true } },
        justtcgLookup: { ids: ["private-id"] },
      }),
    ),
  ) as Record<string, unknown>;

  assert.deepEqual(card, {
    id: "base1-4",
    name: "Charizard",
    number: "4",
    rarity: "Rare Holo",
    artist: "Mitsuhiro Arita",
    flavorText: "Spits fire that is hot enough to melt boulders.",
    set: { id: "base1", name: "Base", series: "Base" },
    images: { small: "small.png", large: "large.png" },
    tcgplayer: { prices: { holofoil: { market: 300 } } },
  });
});

test("gzip negotiation respects an explicit zero quality", () => {
  assert.equal(acceptsGzip("br, gzip"), true);
  assert.equal(acceptsGzip("gzip; q=1.0, br"), true);
  assert.equal(acceptsGzip("gzip;q=0, br"), false);
  assert.equal(acceptsGzip(undefined), false);
});
