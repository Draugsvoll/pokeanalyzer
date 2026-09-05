import { describe, expect, test } from "vitest";
import type { PokemonCard } from "../types/pokemon";
import {
  CARD_CATALOG_MAX_AGE_MS,
  isCardCatalogFresh,
  parseCardCatalog,
  searchCardCatalog,
} from "./cardCatalog";

export function catalogCard(
  id = "base1-4",
  name = "Charizard",
  number = "4",
): PokemonCard {
  return {
    id,
    name,
    number,
    rarity: "Rare Holo",
    artist: "Mitsuhiro Arita",
    flavorText: "Spits fire that is hot enough to melt boulders.",
    subtypes: ["Stage 2"],
    hp: "120",
    types: ["Fire"],
    weaknesses: [{ type: "Water", value: "×2" }],
    retreatCost: ["Colorless", "Colorless", "Colorless"],
    convertedRetreatCost: 3,
    nationalPokedexNumbers: [6],
    legalities: { unlimited: "Legal" },
    set: {
      id: "base1",
      name: "Base",
      series: "Base",
      printedTotal: 102,
      total: 102,
      legalities: { unlimited: "Legal" },
      releaseDate: "1999/01/09",
      updatedAt: "2026/01/01",
      images: { symbol: "symbol.png", logo: "logo.png" },
    },
    images: { small: "small.png", large: "large.png" },
    tcgplayer: {
      url: "https://example.com/card",
      updatedAt: "2026/01/01",
      prices: {
        holofoil: {
          low: 100,
          mid: 200,
          high: 300,
          market: 250,
          directLow: null,
        },
      },
    },
  };
}

function catalogPayload(cards: PokemonCard[], generatedAt: string) {
  return {
    schemaVersion: 1,
    generatedAt,
    sourceVersion: "test-version",
    cardCount: cards.length,
    cards,
  };
}

describe("parseCardCatalog", () => {
  const generatedAt = "2026-09-05T12:00:00.000Z";

  test("accepts a complete TCG-only catalog", () => {
    const parsed = parseCardCatalog(
      catalogPayload([catalogCard()], generatedAt),
    );
    expect(parsed?.cardCount).toBe(1);
    expect(parsed?.cards[0]?.tcgplayer?.prices.holofoil?.market).toBe(250);
  });

  test("accepts the optional and null TCG price fields present in SQL data", () => {
    const withoutPrices = {
      ...catalogCard(),
      tcgplayer: {
        url: "https://example.com/card",
      },
    } as PokemonCard;
    const partialPrices = {
      ...catalogCard("base1-5"),
      tcgplayer: {
        url: "https://example.com/other-card",
        updatedAt: "2026/01/01",
        prices: { holofoil: { market: null } },
      },
    } as unknown as PokemonCard;

    expect(
      parseCardCatalog(
        catalogPayload([withoutPrices, partialPrices], generatedAt),
      )?.cardCount,
    ).toBe(2);
  });

  test("rejects count mismatches, duplicate IDs, and incomplete cards", () => {
    expect(
      parseCardCatalog({
        ...catalogPayload([catalogCard()], generatedAt),
        cardCount: 2,
      }),
    ).toBeNull();
    expect(
      parseCardCatalog(
        catalogPayload([catalogCard(), catalogCard()], generatedAt),
      ),
    ).toBeNull();
    expect(
      parseCardCatalog(
        catalogPayload(
          [{ ...catalogCard(), set: { name: "Base" } } as PokemonCard],
          generatedAt,
        ),
      ),
    ).toBeNull();
  });

  test("rejects fields deliberately excluded from the public catalog", () => {
    expect(
      parseCardCatalog(
        catalogPayload(
          [{ ...catalogCard(), cardmarket: { prices: {} } } as PokemonCard],
          generatedAt,
        ),
      ),
    ).toBeNull();
    expect(
      parseCardCatalog(
        catalogPayload(
          [
            {
              ...catalogCard(),
              grok: { secret: true },
            } as unknown as PokemonCard,
          ],
          generatedAt,
        ),
      ),
    ).toBeNull();
  });
});

describe("catalog freshness", () => {
  const now = Date.parse("2026-09-06T12:00:00.000Z");

  test("accepts catalogs younger than 24 hours", () => {
    expect(
      isCardCatalogFresh(
        {
          generatedAt: new Date(
            now - CARD_CATALOG_MAX_AGE_MS + 1,
          ).toISOString(),
        },
        now,
      ),
    ).toBe(true);
  });

  test("rejects catalogs at 24 hours, invalid dates, and future dates", () => {
    expect(
      isCardCatalogFresh(
        { generatedAt: new Date(now - CARD_CATALOG_MAX_AGE_MS).toISOString() },
        now,
      ),
    ).toBe(false);
    expect(isCardCatalogFresh({ generatedAt: "invalid" }, now)).toBe(false);
    expect(
      isCardCatalogFresh(
        { generatedAt: new Date(now + 6 * 60 * 1000).toISOString() },
        now,
      ),
    ).toBe(false);
  });
});

describe("searchCardCatalog", () => {
  const cards = [
    catalogCard("one", "Charizard", "4"),
    {
      ...catalogCard("two", "Charizard ex", "006"),
      set: {
        ...catalogCard().set,
        name: "Obsidian Flames",
        series: "Scarlet & Violet",
      },
    },
    catalogCard("three", "Pikachu", "25"),
  ];

  test("matches the current AND, LIKE, and exact-number behavior", () => {
    expect(
      searchCardCatalog(cards, {
        pokemonName: "Ch_r%",
        setName: "obsidian",
        setSeries: "scarlet",
        cardNumber: "006",
      }).map((card) => card.id),
    ).toEqual(["two"]);
  });

  test("keeps catalog order, returns valid zero results, and stops at 50", () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      catalogCard(String(index), "Pikachu", String(index)),
    );
    const results = searchCardCatalog(many, {
      pokemonName: "pika",
      setName: "",
      setSeries: "",
      cardNumber: "",
    });
    expect(results).toHaveLength(50);
    expect(results[49]?.id).toBe("49");
    expect(
      searchCardCatalog(cards, {
        pokemonName: "missing",
        setName: "",
        setSeries: "",
        cardNumber: "",
      }),
    ).toEqual([]);
  });
});
