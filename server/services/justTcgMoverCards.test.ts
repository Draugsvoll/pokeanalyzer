import assert from "node:assert/strict";
import test from "node:test";
import type { JustTcgPriceMovement } from "./justTcgApi.js";
import { findUniqueJustTcgMoverCardRow } from "./justTcgMoverCards.js";

type LocalCardFixture = {
  id: string;
  name: string;
  number: string | number;
  printedTotal: string | number;
  rarity: string;
  setName: string;
};

function cardRow(card: LocalCardFixture) {
  return {
    raw_json: JSON.stringify({
      id: card.id,
      name: card.name,
      number: card.number,
      rarity: card.rarity,
      set: {
        name: card.setName,
        printedTotal: card.printedTotal,
      },
    }),
  };
}

function mover(
  overrides: Partial<JustTcgPriceMovement>,
): JustTcgPriceMovement {
  return {
    cardName: "Charizard",
    condition: "Near Mint",
    currentPrice: 100,
    just_tcg_number: "004/102",
    period: "7d",
    printing: "Holofoil",
    rarity: "Rare Holo",
    setName: "Base Set",
    ...overrides,
  };
}

function matchId(
  cards: LocalCardFixture[],
  priceMovement: JustTcgPriceMovement,
) {
  const row = findUniqueJustTcgMoverCardRow(
    cards.map(cardRow),
    priceMovement,
  );
  return row ? JSON.parse(row.raw_json).id : null;
}

const realCardCases: LocalCardFixture[] = [
  {
    id: "base1-1",
    name: "Alakazam",
    number: 1,
    printedTotal: 102,
    rarity: "Rare Holo",
    setName: "Base Set",
  },
  {
    id: "base1-2",
    name: "Blastoise",
    number: 2,
    printedTotal: 102,
    rarity: "Rare Holo",
    setName: "Base Set",
  },
  {
    id: "base1-4",
    name: "Charizard",
    number: 4,
    printedTotal: 102,
    rarity: "Rare Holo",
    setName: "Base Set",
  },
  {
    id: "base1-15",
    name: "Venusaur",
    number: 15,
    printedTotal: 102,
    rarity: "Rare Holo",
    setName: "Base Set",
  },
  {
    id: "base2-4",
    name: "Charizard",
    number: "4",
    printedTotal: "130",
    rarity: "Rare Holo",
    setName: "Base Set 2",
  },
  {
    id: "team-rocket-4",
    name: "Dark Charizard",
    number: "4",
    printedTotal: "82",
    rarity: "Rare Holo",
    setName: "Team Rocket",
  },
  {
    id: "fossil-4",
    name: "Dragonite",
    number: "4",
    printedTotal: "62",
    rarity: "Rare Holo",
    setName: "Fossil",
  },
  {
    id: "fossil-5",
    name: "Gengar",
    number: "5",
    printedTotal: "62",
    rarity: "Rare Holo",
    setName: "Fossil",
  },
  {
    id: "neo-genesis-9",
    name: "Lugia",
    number: "9",
    printedTotal: "111",
    rarity: "Rare Holo",
    setName: "Neo Genesis",
  },
  {
    id: "neo-genesis-17",
    name: "Typhlosion",
    number: "17",
    printedTotal: "111",
    rarity: "Rare Holo",
    setName: "Neo Genesis",
  },
  {
    id: "neo-discovery-1",
    name: "Espeon",
    number: "1",
    printedTotal: "75",
    rarity: "Rare Holo",
    setName: "Neo Discovery",
  },
  {
    id: "neo-discovery-13",
    name: "Umbreon",
    number: "13",
    printedTotal: "75",
    rarity: "Rare Holo",
    setName: "Neo Discovery",
  },
  {
    id: "neo-revelation-65",
    name: "Shining Gyarados",
    number: "65",
    printedTotal: "64",
    rarity: "Secret Rare",
    setName: "Neo Revelation",
  },
  {
    id: "neo-revelation-66",
    name: "Shining Magikarp",
    number: "66",
    printedTotal: "64",
    rarity: "Secret Rare",
    setName: "Neo Revelation",
  },
  {
    id: "pokemon-rumble-3",
    name: "Mewtwo",
    number: "3",
    printedTotal: "16",
    rarity: "Rare",
    setName: "Pokemon Rumble",
  },
  {
    id: "pop3-1",
    name: "Blastoise",
    number: "1",
    printedTotal: "17",
    rarity: "Rare",
    setName: "POP Series 3",
  },
  {
    id: "pop4-3",
    name: "Flygon",
    number: "3",
    printedTotal: "17",
    rarity: "Rare",
    setName: "POP Series 4",
  },
  {
    id: "pop7-2",
    name: "Gallade",
    number: "2",
    printedTotal: "17",
    rarity: "Rare",
    setName: "POP Series 7",
  },
  {
    id: "rising-rivals-82",
    name: "Spheal",
    number: "82",
    printedTotal: "111",
    rarity: "Common",
    setName: "Rising Rivals",
  },
  {
    id: "legends-awakened-57",
    name: "Houndoom",
    number: "57",
    printedTotal: "146",
    rarity: "Uncommon",
    setName: "Legends Awakened",
  },
  {
    id: "league-lillie-125a",
    name: "Lillie",
    number: "125a",
    printedTotal: "156",
    rarity: "Promo",
    setName: "League & Championship Cards",
  },
  {
    id: "expedition-22",
    name: "Pichu",
    number: "22",
    printedTotal: "165",
    rarity: "Rare Holo",
    setName: "Expedition Base Set",
  },
  {
    id: "expedition-19",
    name: "Mew",
    number: "19",
    printedTotal: "165",
    rarity: "Rare Holo",
    setName: "Expedition Base Set",
  },
  {
    id: "southern-islands-1",
    name: "Mew",
    number: "1",
    printedTotal: "18",
    rarity: "Promo",
    setName: "Southern Islands",
  },
  {
    id: "black-star-24",
    name: "Birthday Pikachu",
    number: "24",
    printedTotal: "53",
    rarity: "Promo",
    setName: "Black Star Promos",
  },
];

test("JustTCG mover verifier accepts real-card examples with padded or string numbers", () => {
  for (const card of realCardCases) {
    const cardNumber = String(card.number).padStart(3, "0");
    const printedTotal = String(card.printedTotal).padStart(2, "0");

    assert.equal(
      matchId(
        [card],
        mover({
          cardName: card.name,
          just_tcg_number: `${cardNumber}/${printedTotal}`,
          rarity: card.rarity,
          setName: card.setName,
        }),
      ),
      card.id,
      `${card.name} ${card.number}/${card.printedTotal}`,
    );
  }
});

test("JustTCG mover verifier rejects wrong printed totals for real-card examples", () => {
  for (const card of realCardCases) {
    assert.equal(
      matchId(
        [card],
        mover({
          cardName: card.name,
          just_tcg_number: `${card.number}/999`,
          rarity: card.rarity,
          setName: card.setName,
        }),
      ),
      null,
      `${card.name} should not match wrong printed total`,
    );
  }
});

test("JustTCG mover verifier rejects wrong card numbers for real-card examples", () => {
  for (const card of realCardCases) {
    assert.equal(
      matchId(
        [card],
        mover({
          cardName: card.name,
          just_tcg_number: `999/${card.printedTotal}`,
          rarity: card.rarity,
          setName: card.setName,
        }),
      ),
      null,
      `${card.name} should not match wrong card number`,
    );
  }
});

test("JustTCG mover verifier handles common set-name punctuation and aliases", () => {
  const cases: Array<{
    card: LocalCardFixture;
    justTcgSetName: string;
  }> = [
    {
      card: {
        id: "expedition-pichu",
        name: "Pichu",
        number: "22",
        printedTotal: "165",
        rarity: "Rare Holo",
        setName: "Expedition Base Set",
      },
      justTcgSetName: "Expedition",
    },
    {
      card: {
        id: "league-lillie",
        name: "Lillie",
        number: "125a",
        printedTotal: "156",
        rarity: "Promo",
        setName: "League & Championship Cards",
      },
      justTcgSetName: "League Championship Cards Pokemon",
    },
    {
      card: {
        id: "black-star-pikachu",
        name: "Birthday Pikachu",
        number: "24",
        printedTotal: "53",
        rarity: "Promo",
        setName: "Black Star Promos",
      },
      justTcgSetName: "Nintendo Black Star Promo",
    },
  ];

  for (const { card, justTcgSetName } of cases) {
    assert.equal(
      matchId(
        [card],
        mover({
          cardName: card.name,
          just_tcg_number: `${card.number}/${card.printedTotal}`,
          rarity: card.rarity,
          setName: justTcgSetName,
        }),
      ),
      card.id,
      justTcgSetName,
    );
  }
});

test("JustTCG mover verifier uses strict rarity token counts", () => {
  const rareHoloCharizard: LocalCardFixture = {
    id: "base-charizard",
    name: "Charizard",
    number: "4",
    printedTotal: "102",
    rarity: "Rare Holo",
    setName: "Base Set",
  };

  assert.equal(
    matchId(
      [rareHoloCharizard],
      mover({
        rarity: "Rare",
      }),
    ),
    null,
  );

  assert.equal(
    matchId(
      [rareHoloCharizard],
      mover({
        rarity: "Rare Holofoil",
      }),
    ),
    "base-charizard",
  );

  assert.equal(
    matchId(
      [rareHoloCharizard],
      mover({
        rarity: "Rare Holographic",
      }),
    ),
    "base-charizard",
  );
});

test("JustTCG mover verifier rejects ambiguity after number, name, set, and rarity checks", () => {
  const firstEdition: LocalCardFixture = {
    id: "shadowless-first-edition",
    name: "Charizard",
    number: "4",
    printedTotal: "102",
    rarity: "Rare Holo",
    setName: "Base Set (Shadowless)",
  };
  const unlimited: LocalCardFixture = {
    ...firstEdition,
    id: "shadowless-unlimited",
  };

  assert.equal(
    matchId(
      [firstEdition, unlimited],
      mover({
        cardName: "Charizard",
        just_tcg_number: "004/102",
        rarity: "Rare Holofoil",
        setName: "Base Set (Shadowless)",
      }),
    ),
    null,
  );
});

test("JustTCG mover verifier can disambiguate by rarity before strict set fallback", () => {
  const normalPikachu: LocalCardFixture = {
    id: "pikachu-normal",
    name: "Pikachu",
    number: "58",
    printedTotal: "165",
    rarity: "Rare",
    setName: "Expedition Base Set",
  };
  const holoPikachu: LocalCardFixture = {
    ...normalPikachu,
    id: "pikachu-holo",
    rarity: "Rare Holo",
  };

  assert.equal(
    matchId(
      [normalPikachu, holoPikachu],
      mover({
        cardName: "Pikachu",
        just_tcg_number: "058/165",
        rarity: "Rare Holo",
        setName: "Expedition",
      }),
    ),
    "pikachu-holo",
  );
});

test("JustTCG mover verifier rejects missing or malformed JustTCG printed numbers", () => {
  const charizard = realCardCases.find((card) => card.id === "base1-4");
  assert.ok(charizard);

  for (const just_tcg_number of [undefined, "", "004", "abc/102", "004/"]) {
    assert.equal(
      matchId(
        [charizard],
        mover({
          just_tcg_number,
        }),
      ),
      null,
      String(just_tcg_number),
    );
  }
});

test("JustTCG mover verifier rejects nearby false-positive cards", () => {
  const falsePositiveCases: Array<{
    label: string;
    cards: LocalCardFixture[];
    priceMovement: JustTcgPriceMovement;
  }> = [
    {
      label: "Base Set Charizard should not match Base Set 2 printed total",
      cards: [realCardCases.find((card) => card.id === "base2-4")!],
      priceMovement: mover({
        cardName: "Charizard",
        just_tcg_number: "004/102",
        rarity: "Rare Holo",
        setName: "Base Set",
      }),
    },
    {
      label: "Dark Charizard should not match regular Charizard",
      cards: [realCardCases.find((card) => card.id === "base1-4")!],
      priceMovement: mover({
        cardName: "Dark Charizard",
        just_tcg_number: "004/082",
        rarity: "Rare Holo",
        setName: "Team Rocket",
      }),
    },
    {
      label: "POP Series 3 Blastoise should not match Base Set Blastoise",
      cards: [realCardCases.find((card) => card.id === "base1-2")!],
      priceMovement: mover({
        cardName: "Blastoise",
        just_tcg_number: "001/017",
        rarity: "Rare",
        setName: "POP Series 3",
      }),
    },
    {
      label: "Southern Islands Mew should not match Expedition Mew",
      cards: [realCardCases.find((card) => card.id === "expedition-19")!],
      priceMovement: mover({
        cardName: "Mew",
        just_tcg_number: "001/018",
        rarity: "Promo",
        setName: "Southern Islands",
      }),
    },
  ];

  for (const { cards, label, priceMovement } of falsePositiveCases) {
    assert.equal(matchId(cards, priceMovement), null, label);
  }
});
