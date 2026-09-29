export type SetDirectoryMetadata = {
  cardCount?: number;
  era?: string;
  releaseYear?: number;
};

const SET_DIRECTORY_METADATA_BY_NAME: Readonly<
  Record<string, SetDirectoryMetadata>
> = {
  "Alternate Art Promos": {
    era: "Promo",
  },
  Aquapolis: {
    cardCount: 182,
    era: "e-Card",
    releaseYear: 2003,
  },
  Arceus: {
    cardCount: 111,
    era: "Platinum",
    releaseYear: 2009,
  },
  "Ash vs Team Rocket Deck Kit (JP Exclusive)": {
    cardCount: 26,
    era: "Sun & Moon",
    releaseYear: 2017,
  },
  "Base Set": {
    cardCount: 102,
    era: "Base",
    releaseYear: 1999,
  },
  "Base Set (Shadowless)": {
    cardCount: 102,
    era: "Base",
    releaseYear: 1999,
  },
  "Base Set 2": {
    cardCount: 130,
    era: "Base",
    releaseYear: 2000,
  },
  "Battle Academy": {
    era: "Sword & Shield",
    releaseYear: 2020,
  },
  "Battle Academy 2022": {
    era: "Sword & Shield",
    releaseYear: 2022,
  },
  "Battle Academy 2024": {
    cardCount: 66,
    era: "Scarlet & Violet",
    releaseYear: 2024,
  },
  "Best of Promos": {
    cardCount: 9,
    era: "Other",
    releaseYear: 2002,
  },
  "Black and White": {
    cardCount: 115,
    era: "Black & White",
    releaseYear: 2011,
  },
  "Black and White Promos": {
    cardCount: 101,
    era: "Black & White",
    releaseYear: 2011,
  },
  "Blister Exclusives": {
    era: "Promo",
  },
  "Boundaries Crossed": {
    cardCount: 153,
    era: "Black & White",
    releaseYear: 2012,
  },
  "Burger King Promos": {
    era: "Promo",
    releaseYear: 1999,
  },
  "BW Trainer Kit: Excadrill & Zoroark": {
    era: "Black & White",
    releaseYear: 2011,
  },
  "Call of Legends": {
    cardCount: 106,
    era: "HeartGold & SoulSilver",
    releaseYear: 2011,
  },
  Celebrations: {
    cardCount: 25,
    era: "Sword & Shield",
    releaseYear: 2021,
  },
  "Celebrations: Classic Collection": {
    cardCount: 25,
    era: "Sword & Shield",
    releaseYear: 2021,
  },
  "Champion's Path": {
    cardCount: 80,
    era: "Sword & Shield",
    releaseYear: 2020,
  },
  "Countdown Calendar Promos": {
    era: "Promo",
  },
  "Dark Explorers": {
    cardCount: 111,
    era: "Black & White",
    releaseYear: 2012,
  },
  "Deck Exclusives": {
    era: "Promo",
  },
  Deoxys: {
    cardCount: 108,
    era: "EX",
    releaseYear: 2005,
  },
  "Detective Pikachu": {
    cardCount: 18,
    era: "Sun & Moon",
    releaseYear: 2019,
  },
  "Diamond and Pearl": {
    cardCount: 130,
    era: "Diamond & Pearl",
    releaseYear: 2007,
  },
  "Diamond and Pearl Promos": {
    cardCount: 56,
    era: "Diamond & Pearl",
    releaseYear: 2007,
  },
  "Double Crisis": {
    cardCount: 34,
    era: "XY",
    releaseYear: 2015,
  },
  "DP Trainer Kit: Manaphy & Lucario": {
    era: "Diamond & Pearl",
    releaseYear: 2007,
  },
  "Dragon Majesty": {
    cardCount: 80,
    era: "Sun & Moon",
    releaseYear: 2018,
  },
  "Dragon Vault": {
    cardCount: 21,
    era: "Black & White",
    releaseYear: 2012,
  },
  "Dragons Exalted": {
    cardCount: 128,
    era: "Black & White",
    releaseYear: 2012,
  },
  "e-Reader Sample Cards": {
    era: "e-Card",
    releaseYear: 2002,
  },
  "Emerging Powers": {
    cardCount: 98,
    era: "Black & White",
    releaseYear: 2011,
  },
  "EX Battle Stadium": {
    era: "EX",
    releaseYear: 2004,
  },
  "EX Crystal Guardians": {
    cardCount: 100,
    era: "EX",
    releaseYear: 2006,
  },
  "EX Delta Species": {
    cardCount: 114,
    era: "EX",
    releaseYear: 2005,
  },
  "EX Deoxys": {
    cardCount: 108,
    era: "EX",
    releaseYear: 2005,
  },
  "EX Dragon": {
    cardCount: 100,
    era: "EX",
    releaseYear: 2003,
  },
  "EX Dragon Frontiers": {
    cardCount: 101,
    era: "EX",
    releaseYear: 2006,
  },
  "EX Emerald": {
    cardCount: 107,
    era: "EX",
    releaseYear: 2005,
  },
  "EX FireRed & LeafGreen": {
    cardCount: 116,
    era: "EX",
    releaseYear: 2004,
  },
  "EX Hidden Legends": {
    cardCount: 102,
    era: "EX",
    releaseYear: 2004,
  },
  "EX Holon Phantoms": {
    cardCount: 111,
    era: "EX",
    releaseYear: 2006,
  },
  "EX Legend Maker": {
    cardCount: 93,
    era: "EX",
    releaseYear: 2006,
  },
  "EX Power Keepers": {
    cardCount: 108,
    era: "EX",
    releaseYear: 2007,
  },
  "EX Ruby and Sapphire": {
    cardCount: 109,
    era: "EX",
    releaseYear: 2003,
  },
  "EX Sandstorm": {
    cardCount: 100,
    era: "EX",
    releaseYear: 2003,
  },
  "EX Team Magma vs Team Aqua": {
    cardCount: 97,
    era: "EX",
    releaseYear: 2004,
  },
  "EX Team Rocket Returns": {
    cardCount: 111,
    era: "EX",
    releaseYear: 2004,
  },
  "EX Trainer Kit 1: Latias & Latios": {
    cardCount: 20,
    era: "EX",
    releaseYear: 2004,
  },
  "EX Trainer Kit 2: Plusle & Minun": {
    cardCount: 24,
    era: "EX",
    releaseYear: 2006,
  },
  "EX Unseen Forces": {
    cardCount: 145,
    era: "EX",
    releaseYear: 2005,
  },
  Expedition: {
    cardCount: 165,
    era: "e-Card",
    releaseYear: 2002,
  },
  "First Partner Pack": {
    era: "Sword & Shield",
    releaseYear: 2019,
  },
  Fossil: {
    cardCount: 62,
    era: "Base",
    releaseYear: 1999,
  },
  Generations: {
    cardCount: 83,
    era: "XY",
    releaseYear: 2016,
  },
  "Generations: Radiant Collection": {
    cardCount: 32,
    era: "XY",
    releaseYear: 2016,
  },
  "Great Encounters": {
    cardCount: 106,
    era: "Diamond & Pearl",
    releaseYear: 2008,
  },
  "Gym Challenge": {
    cardCount: 132,
    era: "Gym",
    releaseYear: 2000,
  },
  "Gym Heroes": {
    cardCount: 132,
    era: "Gym",
    releaseYear: 2000,
  },
  "HeartGold SoulSilver": {
    cardCount: 124,
    era: "HeartGold & SoulSilver",
    releaseYear: 2010,
  },
  "HGSS Promos": {
    cardCount: 25,
    era: "HeartGold & SoulSilver",
    releaseYear: 2010,
  },
  "HGSS Trainer Kit: Gyarados & Raichu": {
    era: "HeartGold & SoulSilver",
    releaseYear: 2010,
  },
  "Hidden Fates": {
    cardCount: 69,
    era: "Sun & Moon",
    releaseYear: 2019,
  },
  "Hidden Fates: Shiny Vault": {
    cardCount: 94,
    era: "Sun & Moon",
    releaseYear: 2019,
  },
  "Holon Phantoms": {
    cardCount: 111,
    era: "EX",
    releaseYear: 2006,
  },
  "Jumbo Cards": {
    era: "Promo",
  },
  Jungle: {
    cardCount: 64,
    era: "Base",
    releaseYear: 1999,
  },
  "Kalos Starter Set": {
    cardCount: 39,
    era: "XY",
    releaseYear: 2013,
  },
  "Kids WB Promos": {
    era: "Promo",
    releaseYear: 1999,
  },
  "League & Championship Cards": {
    era: "Promo",
  },
  "Legend Maker": {
    cardCount: 93,
    era: "EX",
    releaseYear: 2006,
  },
  "Legendary Collection": {
    cardCount: 110,
    era: "Other",
    releaseYear: 2002,
  },
  "Legendary Treasures": {
    cardCount: 115,
    era: "Black & White",
    releaseYear: 2013,
  },
  "Legendary Treasures: Radiant Collection": {
    cardCount: 25,
    era: "Black & White",
    releaseYear: 2013,
  },
  "Legends Awakened": {
    cardCount: 146,
    era: "Diamond & Pearl",
    releaseYear: 2008,
  },
  "Majestic Dawn": {
    cardCount: 100,
    era: "Diamond & Pearl",
    releaseYear: 2008,
  },
  "McDonald's 25th Anniversary Promos": {
    cardCount: 25,
    era: "Other",
    releaseYear: 2021,
  },
  "McDonald's Promos 2011": {
    cardCount: 12,
    era: "Other",
    releaseYear: 2011,
  },
  "McDonald's Promos 2012": {
    cardCount: 12,
    era: "Other",
    releaseYear: 2012,
  },
  "McDonald's Promos 2014": {
    cardCount: 12,
    era: "Other",
    releaseYear: 2014,
  },
  "McDonald's Promos 2015": {
    cardCount: 12,
    era: "Other",
    releaseYear: 2015,
  },
  "McDonald's Promos 2016": {
    cardCount: 12,
    era: "Other",
    releaseYear: 2016,
  },
  "McDonald's Promos 2017": {
    cardCount: 12,
    era: "Other",
    releaseYear: 2017,
  },
  "McDonald's Promos 2018": {
    cardCount: 12,
    era: "Other",
    releaseYear: 2018,
  },
  "McDonald's Promos 2019": {
    cardCount: 12,
    era: "Other",
    releaseYear: 2019,
  },
  "McDonald's Promos 2022": {
    cardCount: 15,
    era: "Other",
    releaseYear: 2022,
  },
  "McDonald's Promos 2023": {
    cardCount: 15,
    era: "Other",
    releaseYear: 2023,
  },
  "McDonald's Promos 2024": {
    cardCount: 15,
    era: "Other",
    releaseYear: 2024,
  },
  "ME: 30th Celebration": {
    cardCount: 161,
    era: "Mega Evolution",
    releaseYear: 2026,
  },
  "ME: 30th Celebration Classic Collection": {
    cardCount: 30,
    era: "Mega Evolution",
    releaseYear: 2026,
  },
  "ME: Ascended Heroes": {
    cardCount: 295,
    era: "Mega Evolution",
    releaseYear: 2026,
  },
  "ME: Mega Evolution Promo": {
    cardCount: 89,
    era: "Mega Evolution",
    releaseYear: 2025,
  },
  "ME01: Mega Evolution": {
    cardCount: 188,
    era: "Mega Evolution",
    releaseYear: 2025,
  },
  "ME02: Phantasmal Flames": {
    cardCount: 130,
    era: "Mega Evolution",
    releaseYear: 2025,
  },
  "ME03: Perfect Order": {
    cardCount: 124,
    era: "Mega Evolution",
    releaseYear: 2026,
  },
  "ME04: Chaos Rising": {
    cardCount: 122,
    era: "Mega Evolution",
    releaseYear: 2026,
  },
  "ME05: Pitch Black": {
    cardCount: 120,
    era: "Mega Evolution",
    releaseYear: 2026,
  },
  "MEE: Mega Evolution Energies": {
    cardCount: 8,
    era: "Mega Evolution",
    releaseYear: 2025,
  },
  "Miscellaneous Cards & Products": {
    era: "Other",
  },
  "My First Battle": {
    cardCount: 34,
    era: "Scarlet & Violet",
    releaseYear: 2023,
  },
  "Mysterious Treasures": {
    cardCount: 124,
    era: "Diamond & Pearl",
    releaseYear: 2007,
  },
  "Neo Destiny": {
    cardCount: 113,
    era: "Neo",
    releaseYear: 2002,
  },
  "Neo Discovery": {
    cardCount: 75,
    era: "Neo",
    releaseYear: 2001,
  },
  "Neo Genesis": {
    cardCount: 111,
    era: "Neo",
    releaseYear: 2000,
  },
  "Neo Revelation": {
    cardCount: 66,
    era: "Neo",
    releaseYear: 2001,
  },
  "Next Destinies": {
    cardCount: 103,
    era: "Black & White",
    releaseYear: 2012,
  },
  "Nintendo Promos": {
    cardCount: 40,
    era: "NP",
    releaseYear: 2003,
  },
  "Noble Victories": {
    cardCount: 102,
    era: "Black & White",
    releaseYear: 2011,
  },
  "Pikachu World Collection Promos": {
    cardCount: 9,
    era: "Promo",
    releaseYear: 2002,
  },
  "Plasma Blast": {
    cardCount: 105,
    era: "Black & White",
    releaseYear: 2013,
  },
  "Plasma Freeze": {
    cardCount: 122,
    era: "Black & White",
    releaseYear: 2013,
  },
  "Plasma Storm": {
    cardCount: 138,
    era: "Black & White",
    releaseYear: 2013,
  },
  Platinum: {
    cardCount: 133,
    era: "Platinum",
    releaseYear: 2009,
  },
  "Player Placement Trainer Promos": {
    era: "Promo",
  },
  "Pokemon GO": {
    cardCount: 88,
    era: "Sword & Shield",
    releaseYear: 2022,
  },
  "POP Series 1": {
    cardCount: 17,
    era: "POP",
    releaseYear: 2004,
  },
  "POP Series 2": {
    cardCount: 17,
    era: "POP",
    releaseYear: 2005,
  },
  "POP Series 3": {
    cardCount: 17,
    era: "POP",
    releaseYear: 2006,
  },
  "POP Series 4": {
    cardCount: 17,
    era: "POP",
    releaseYear: 2006,
  },
  "POP Series 5": {
    cardCount: 17,
    era: "POP",
    releaseYear: 2007,
  },
  "POP Series 6": {
    cardCount: 17,
    era: "POP",
    releaseYear: 2007,
  },
  "POP Series 7": {
    cardCount: 17,
    era: "POP",
    releaseYear: 2008,
  },
  "POP Series 8": {
    cardCount: 17,
    era: "POP",
    releaseYear: 2008,
  },
  "POP Series 9": {
    cardCount: 17,
    era: "POP",
    releaseYear: 2009,
  },
  "Prize Pack Series Cards": {
    era: "Promo",
  },
  "Professor Program Promos": {
    era: "Promo",
  },
  "Rising Rivals": {
    cardCount: 120,
    era: "Platinum",
    releaseYear: 2009,
  },
  Rumble: {
    cardCount: 16,
    era: "Other",
    releaseYear: 2009,
  },
  "Secret Wonders": {
    cardCount: 132,
    era: "Diamond & Pearl",
    releaseYear: 2007,
  },
  "Shining Fates": {
    cardCount: 73,
    era: "Sword & Shield",
    releaseYear: 2021,
  },
  "Shining Fates: Shiny Vault": {
    cardCount: 122,
    era: "Sword & Shield",
    releaseYear: 2021,
  },
  "Shining Legends": {
    cardCount: 81,
    era: "Sun & Moon",
    releaseYear: 2017,
  },
  Skyridge: {
    cardCount: 182,
    era: "e-Card",
    releaseYear: 2003,
  },
  "SM - Burning Shadows": {
    cardCount: 177,
    era: "Sun & Moon",
    releaseYear: 2017,
  },
  "SM - Celestial Storm": {
    cardCount: 187,
    era: "Sun & Moon",
    releaseYear: 2018,
  },
  "SM - Cosmic Eclipse": {
    cardCount: 272,
    era: "Sun & Moon",
    releaseYear: 2019,
  },
  "SM - Crimson Invasion": {
    cardCount: 126,
    era: "Sun & Moon",
    releaseYear: 2017,
  },
  "SM - Forbidden Light": {
    cardCount: 150,
    era: "Sun & Moon",
    releaseYear: 2018,
  },
  "SM - Guardians Rising": {
    cardCount: 180,
    era: "Sun & Moon",
    releaseYear: 2017,
  },
  "SM - Lost Thunder": {
    cardCount: 240,
    era: "Sun & Moon",
    releaseYear: 2018,
  },
  "SM - Team Up": {
    cardCount: 198,
    era: "Sun & Moon",
    releaseYear: 2019,
  },
  "SM - Ultra Prism": {
    cardCount: 178,
    era: "Sun & Moon",
    releaseYear: 2018,
  },
  "SM - Unbroken Bonds": {
    cardCount: 234,
    era: "Sun & Moon",
    releaseYear: 2019,
  },
  "SM - Unified Minds": {
    cardCount: 260,
    era: "Sun & Moon",
    releaseYear: 2019,
  },
  "SM Base Set": {
    cardCount: 173,
    era: "Sun & Moon",
    releaseYear: 2017,
  },
  "SM Promos": {
    cardCount: 250,
    era: "Sun & Moon",
    releaseYear: 2017,
  },
  "SM Trainer Kit: Alolan Sandslash & Alolan Ninetales": {
    era: "Sun & Moon",
    releaseYear: 2017,
  },
  "SM Trainer Kit: Lycanroc & Alolan Raichu": {
    era: "Sun & Moon",
    releaseYear: 2018,
  },
  "Southeast Asia Exclusives": {
    era: "Promo",
  },
  "Southern Islands": {
    cardCount: 18,
    era: "Other",
    releaseYear: 2001,
  },
  Stormfront: {
    cardCount: 106,
    era: "Diamond & Pearl",
    releaseYear: 2008,
  },
  "Supreme Victors": {
    cardCount: 153,
    era: "Platinum",
    releaseYear: 2009,
  },
  "SV: Black Bolt": {
    cardCount: 172,
    era: "Scarlet & Violet",
    releaseYear: 2025,
  },
  "SV: Paldean Fates": {
    cardCount: 245,
    era: "Scarlet & Violet",
    releaseYear: 2024,
  },
  "SV: Prismatic Evolutions": {
    cardCount: 180,
    era: "Scarlet & Violet",
    releaseYear: 2025,
  },
  "SV: Scarlet & Violet 151": {
    cardCount: 207,
    era: "Scarlet & Violet",
    releaseYear: 2023,
  },
  "SV: Scarlet & Violet Promo Cards": {
    cardCount: 226,
    era: "Scarlet & Violet",
    releaseYear: 2023,
  },
  "SV: Shrouded Fable": {
    cardCount: 99,
    era: "Scarlet & Violet",
    releaseYear: 2024,
  },
  "SV: White Flare": {
    cardCount: 173,
    era: "Scarlet & Violet",
    releaseYear: 2025,
  },
  "SV01: Scarlet & Violet Base Set": {
    cardCount: 258,
    era: "Scarlet & Violet",
    releaseYear: 2023,
  },
  "SV02: Paldea Evolved": {
    cardCount: 279,
    era: "Scarlet & Violet",
    releaseYear: 2023,
  },
  "SV03: Obsidian Flames": {
    cardCount: 230,
    era: "Scarlet & Violet",
    releaseYear: 2023,
  },
  "SV04: Paradox Rift": {
    cardCount: 266,
    era: "Scarlet & Violet",
    releaseYear: 2023,
  },
  "SV05: Temporal Forces": {
    cardCount: 218,
    era: "Scarlet & Violet",
    releaseYear: 2024,
  },
  "SV06: Twilight Masquerade": {
    cardCount: 226,
    era: "Scarlet & Violet",
    releaseYear: 2024,
  },
  "SV07: Stellar Crown": {
    cardCount: 175,
    era: "Scarlet & Violet",
    releaseYear: 2024,
  },
  "SV08: Surging Sparks": {
    cardCount: 252,
    era: "Scarlet & Violet",
    releaseYear: 2024,
  },
  "SV09: Journey Together": {
    cardCount: 190,
    era: "Scarlet & Violet",
    releaseYear: 2025,
  },
  "SV10: Destined Rivals": {
    cardCount: 244,
    era: "Scarlet & Violet",
    releaseYear: 2025,
  },
  "SVE: Scarlet & Violet Energies": {
    cardCount: 8,
    era: "Scarlet & Violet",
    releaseYear: 2023,
  },
  "SWSH: Crown Zenith": {
    cardCount: 160,
    era: "Sword & Shield",
    releaseYear: 2023,
  },
  "SWSH: Crown Zenith: Galarian Gallery": {
    cardCount: 70,
    era: "Sword & Shield",
    releaseYear: 2023,
  },
  "SWSH: Sword & Shield Promo Cards": {
    cardCount: 307,
    era: "Sword & Shield",
    releaseYear: 2019,
  },
  "SWSH01: Sword & Shield Base Set": {
    cardCount: 216,
    era: "Sword & Shield",
    releaseYear: 2020,
  },
  "SWSH02: Rebel Clash": {
    cardCount: 209,
    era: "Sword & Shield",
    releaseYear: 2020,
  },
  "SWSH03: Darkness Ablaze": {
    cardCount: 201,
    era: "Sword & Shield",
    releaseYear: 2020,
  },
  "SWSH04: Vivid Voltage": {
    cardCount: 203,
    era: "Sword & Shield",
    releaseYear: 2020,
  },
  "SWSH05: Battle Styles": {
    cardCount: 183,
    era: "Sword & Shield",
    releaseYear: 2021,
  },
  "SWSH06: Chilling Reign": {
    cardCount: 233,
    era: "Sword & Shield",
    releaseYear: 2021,
  },
  "SWSH07: Evolving Skies": {
    cardCount: 237,
    era: "Sword & Shield",
    releaseYear: 2021,
  },
  "SWSH08: Fusion Strike": {
    cardCount: 284,
    era: "Sword & Shield",
    releaseYear: 2021,
  },
  "SWSH09: Brilliant Stars": {
    cardCount: 186,
    era: "Sword & Shield",
    releaseYear: 2022,
  },
  "SWSH09: Brilliant Stars Trainer Gallery": {
    cardCount: 30,
    era: "Sword & Shield",
    releaseYear: 2022,
  },
  "SWSH10: Astral Radiance": {
    cardCount: 216,
    era: "Sword & Shield",
    releaseYear: 2022,
  },
  "SWSH10: Astral Radiance Trainer Gallery": {
    cardCount: 30,
    era: "Sword & Shield",
    releaseYear: 2022,
  },
  "SWSH11: Lost Origin": {
    cardCount: 217,
    era: "Sword & Shield",
    releaseYear: 2022,
  },
  "SWSH11: Lost Origin Trainer Gallery": {
    cardCount: 30,
    era: "Sword & Shield",
    releaseYear: 2022,
  },
  "SWSH12: Silver Tempest": {
    cardCount: 215,
    era: "Sword & Shield",
    releaseYear: 2022,
  },
  "SWSH12: Silver Tempest Trainer Gallery": {
    cardCount: 30,
    era: "Sword & Shield",
    releaseYear: 2022,
  },
  "Team Rocket": {
    cardCount: 83,
    era: "Base",
    releaseYear: 2000,
  },
  "Team Rocket Returns": {
    cardCount: 111,
    era: "EX",
    releaseYear: 2004,
  },
  "Trading Card Game Classic": {
    cardCount: 102,
    era: "Sword & Shield",
    releaseYear: 2023,
  },
  "Trick or Trade BOOster Bundle": {
    cardCount: 30,
    era: "Sword & Shield",
    releaseYear: 2022,
  },
  "Trick or Trade BOOster Bundle 2023": {
    cardCount: 30,
    era: "Scarlet & Violet",
    releaseYear: 2023,
  },
  "Trick or Trade BOOster Bundle 2024": {
    cardCount: 30,
    era: "Scarlet & Violet",
    releaseYear: 2024,
  },
  Triumphant: {
    cardCount: 103,
    era: "HeartGold & SoulSilver",
    releaseYear: 2010,
  },
  Undaunted: {
    cardCount: 91,
    era: "HeartGold & SoulSilver",
    releaseYear: 2010,
  },
  Unleashed: {
    cardCount: 96,
    era: "HeartGold & SoulSilver",
    releaseYear: 2010,
  },
  "World Championship Decks": {
    era: "Other",
  },
  "WoTC Promo": {
    cardCount: 53,
    era: "Base",
    releaseYear: 1999,
  },
  "XY - Ancient Origins": {
    cardCount: 100,
    era: "XY",
    releaseYear: 2015,
  },
  "XY - BREAKpoint": {
    cardCount: 126,
    era: "XY",
    releaseYear: 2016,
  },
  "XY - BREAKthrough": {
    cardCount: 165,
    era: "XY",
    releaseYear: 2015,
  },
  "XY - Evolutions": {
    cardCount: 113,
    era: "XY",
    releaseYear: 2016,
  },
  "XY - Fates Collide": {
    cardCount: 129,
    era: "XY",
    releaseYear: 2016,
  },
  "XY - Flashfire": {
    cardCount: 110,
    era: "XY",
    releaseYear: 2014,
  },
  "XY - Furious Fists": {
    cardCount: 114,
    era: "XY",
    releaseYear: 2014,
  },
  "XY - Phantom Forces": {
    cardCount: 124,
    era: "XY",
    releaseYear: 2014,
  },
  "XY - Primal Clash": {
    cardCount: 164,
    era: "XY",
    releaseYear: 2015,
  },
  "XY - Roaring Skies": {
    cardCount: 112,
    era: "XY",
    releaseYear: 2015,
  },
  "XY - Steam Siege": {
    cardCount: 116,
    era: "XY",
    releaseYear: 2016,
  },
  "XY Base Set": {
    cardCount: 146,
    era: "XY",
    releaseYear: 2014,
  },
  "XY Promos": {
    cardCount: 216,
    era: "XY",
    releaseYear: 2013,
  },
  "XY Trainer Kit: Bisharp & Wigglytuff": {
    era: "XY",
    releaseYear: 2014,
  },
  "XY Trainer Kit: Latias & Latios": {
    era: "XY",
    releaseYear: 2015,
  },
  "XY Trainer Kit: Pikachu Libre & Suicune": {
    era: "XY",
    releaseYear: 2016,
  },
  "XY Trainer Kit: Sylveon & Noivern": {
    era: "XY",
    releaseYear: 2016,
  },
};

export function getSetDirectoryMetadata(
  setName: string,
): SetDirectoryMetadata | null {
  return SET_DIRECTORY_METADATA_BY_NAME[setName] ?? null;
}
