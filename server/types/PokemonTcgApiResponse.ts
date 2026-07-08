import type { PokemonTcgApiCard } from "./PokemonTcgApiCard";

export type PokemonTcgApiResponse = {
  data: PokemonTcgApiCard[];
  page: number;
  pageSize: number;
  count: number;
  totalCount: number;
};