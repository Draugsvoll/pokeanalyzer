import type { PokemonTcgApiCard } from "./PokemonTcgApiCard";

export type PokemonTcgApiPaginatedResponse<T> = {
  data: T[];
  page: number;
  pageSize: number;
  count: number;
  totalCount: number;
};

export type PokemonTcgApiResponse =
  PokemonTcgApiPaginatedResponse<PokemonTcgApiCard>;
