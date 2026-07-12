import type { Attack } from "./attacks";
import type { CardSet } from "./set";
import type { CardImages } from "./images";
import type { CardMarket, TCGPlayer } from "./pricing";
import type { Legalities, TypeEffect } from "./shared";

export type PokemonCard = {
  id: string;
  name: string;
  supertype?: string;
  subtypes?: string[];

  hp?: string;
  types?: string[];
  evolvesFrom?: string;
  attacks?: Attack[];
  weaknesses?: TypeEffect[];
  resistances?: TypeEffect[];
  retreatCost?: string[];
  convertedRetreatCost?: number;
  set: CardSet;
  number?: string;
  artist?: string;
  rarity?: string;
  flavorText?: string;
  nationalPokedexNumbers?: number[];
  legalities?: Legalities;
  images: CardImages;
  tcgplayer?: TCGPlayer;
  cardmarket?: CardMarket;
};
