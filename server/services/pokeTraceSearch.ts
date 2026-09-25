import type { Client } from "@libsql/client";
import {
  POKETRACE_SEARCH_PAGE_SIZE,
  POKETRACE_SEARCH_RESULT_LIMIT,
  type PokeTraceSearchPage,
  type PokeTraceSearchSort,
} from "../../shared/pokeTraceSearch.js";
import { ensurePokeTraceReady, pokeTraceDb } from "../db/pokeTraceDb.js";
import { toPokemonCard } from "./pokeTraceCardView.js";

export type PokeTraceSearchQuery = {
  cardId: string;
  cardNumber: string;
  maxPrice?: number;
  minPrice?: number;
  offset: number;
  pokemonName: string;
  rarity: string;
  setName: string;
  sort: PokeTraceSearchSort;
};

type SearchDatabase = Pick<Client, "execute">;

export async function loadPokeTraceSearchPage(
  query: PokeTraceSearchQuery,
  database: SearchDatabase = pokeTraceDb,
  ready: Promise<unknown> = ensurePokeTraceReady(),
): Promise<PokeTraceSearchPage<ReturnType<typeof toPokemonCard>>> {
  await ready;

  if (query.offset >= POKETRACE_SEARCH_RESULT_LIMIT) {
    return { hasMore: false, items: [], nextOffset: null, total: null };
  }

  const pricePath = "$.prices.tcgplayer.NEAR_MINT.avg";
  const priceSortOrder = query.sort === "price-low-high" ? "ASC" : "DESC";
  const includeTotal = query.offset === 0;
  const result = await database.execute({
    sql: `
      WITH filtered_cards AS (
        SELECT
          id,
          name,
          card_number,
          set_name,
          variant,
          raw_json,
          tcg_market_comparisons,
          CAST(json_extract(raw_json, ?) AS REAL) AS sort_price
        FROM poketrace_cards
        WHERE (? = '' OR instr(lower(name), lower(?)) > 0)
          AND (? = '' OR instr(lower(set_name), lower(?)) > 0)
          AND (
            ? = ''
            OR lower(card_number) = lower(?)
            OR lower(
              ltrim(
                CASE
                  WHEN instr(card_number, '/') > 0
                    THEN substr(card_number, 1, instr(card_number, '/') - 1)
                  ELSE card_number
                END,
                '0'
              )
            ) = lower(ltrim(?, '0'))
          )
          AND (? = '' OR lower(rarity) = lower(?))
          AND (? = '' OR instr(lower(id), lower(?)) > 0)
          AND (
            ? IS NULL
            OR CAST(json_extract(raw_json, ?) AS REAL) >= ?
          )
          AND (
            ? IS NULL
            OR CAST(json_extract(raw_json, ?) AS REAL) <= ?
          )
      )
      SELECT
        raw_json,
        tcg_market_comparisons
        ${includeTotal ? ", COUNT(*) OVER() AS total" : ""}
      FROM filtered_cards
      ORDER BY
        CASE WHEN sort_price IS NULL OR sort_price <= 0 THEN 1 ELSE 0 END,
        sort_price ${priceSortOrder},
        name,
        set_name,
        card_number,
        variant,
        id
      LIMIT ? OFFSET ?
    `,
    args: [
      pricePath,
      query.pokemonName,
      query.pokemonName,
      query.setName,
      query.setName,
      query.cardNumber,
      query.cardNumber,
      query.cardNumber,
      query.rarity,
      query.rarity,
      query.cardId,
      query.cardId,
      query.minPrice ?? null,
      pricePath,
      query.minPrice ?? null,
      query.maxPrice ?? null,
      pricePath,
      query.maxPrice ?? null,
      POKETRACE_SEARCH_PAGE_SIZE + (includeTotal ? 0 : 1),
      query.offset,
    ],
  });

  const pageRows = includeTotal
    ? result.rows
    : result.rows.slice(0, POKETRACE_SEARCH_PAGE_SIZE);
  const total = includeTotal
    ? Math.min(
        Number(result.rows[0]?.total ?? 0),
        POKETRACE_SEARCH_RESULT_LIMIT,
      )
    : null;
  const items = pageRows.map((row) =>
    toPokemonCard(row.raw_json, {}, [], row.tcg_market_comparisons),
  );
  const followingOffset = query.offset + items.length;
  const hasMore = includeTotal
    ? followingOffset < (total ?? 0)
    : result.rows.length > POKETRACE_SEARCH_PAGE_SIZE &&
      followingOffset < POKETRACE_SEARCH_RESULT_LIMIT;
  const nextOffset = hasMore ? followingOffset : null;

  return {
    hasMore,
    items,
    nextOffset,
    total,
  };
}
