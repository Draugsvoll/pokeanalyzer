import type { PokemonCard } from "./pokemon";

export type JustTcgMovementPeriod = "24h" | "7d" | "30d";

export type JustTcgMover = {
  absoluteChange?: number;
  cardName: string;
  changePercent?: number;
  condition: string;
  currentPrice: number;
  period: JustTcgMovementPeriod;
  printing: string;
  setName?: string;
};

export type JustTcgMovementResult = {
  card: PokemonCard;
  mover: JustTcgMover;
};

export type JustTcgMoversPayload = {
  cards: JustTcgMovementResult[];
  period: JustTcgMovementPeriod;
  updatedAt: string;
};
