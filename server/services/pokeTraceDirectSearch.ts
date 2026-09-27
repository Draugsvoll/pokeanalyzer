import type { Client, InValue } from "@libsql/client";
import { toPokeTraceCatalogPokemonCard } from "../../shared/pokeTraceCatalog.js";
import {
  searchPokeTraceCatalogCards,
  type PokeTraceCatalogSearch,
} from "../../shared/pokeTraceCatalogSearch.js";
import type { PokeTraceRawCondition } from "../../shared/pokeTraceMarketConditions.js";
import {
  POKETRACE_SEARCH_RESULT_LIMIT,
  type PokeTraceSearchResponse,
} from "../../shared/pokeTraceSearch.js";
import { ensurePokeTraceReady, pokeTraceDb } from "../db/pokeTraceDb.js";
import { toPokeTraceCatalogCard } from "./pokeTraceCatalog.js";

const CONDITION_PATHS: Record<PokeTraceRawCondition, string> = {
  NEAR_MINT: "$.prices.tcgplayer.NEAR_MINT.avg",
  LIGHTLY_PLAYED: "$.prices.tcgplayer.LIGHTLY_PLAYED.avg",
  MODERATELY_PLAYED: "$.prices.tcgplayer.MODERATELY_PLAYED.avg",
  HEAVILY_PLAYED: "$.prices.tcgplayer.HEAVILY_PLAYED.avg",
  DAMAGED: "$.prices.tcgplayer.DAMAGED.avg",
};

type DirectSearchDependencies = {
  database: Pick<Client, "execute">;
  ensureReady: () => Promise<void>;
};

type PokeTraceDirectSearchQuery = PokeTraceCatalogSearch;

function cardNumberNumerator(value: string) {
  return value.split("/", 1)[0]?.trim() ?? "";
}

export async function loadDirectPokeTraceSearch(
  search: PokeTraceDirectSearchQuery,
  dependencies: Partial<DirectSearchDependencies> = {},
): Promise<
  PokeTraceSearchResponse<ReturnType<typeof toPokeTraceCatalogPokemonCard>>
> {
  const database = dependencies.database ?? pokeTraceDb;
  const ensureReady = dependencies.ensureReady ?? ensurePokeTraceReady;
  await ensureReady();
  const where: string[] = [];
  const args: InValue[] = [];

  const pokemonName = search.pokemonName.trim();
  if (pokemonName) {
    where.push("instr(lower(name), lower(?)) > 0");
    args.push(pokemonName);
  }

  const setName = search.setName.trim();
  if (setName) {
    where.push(
      search.setNameExact
        ? "set_name = ? COLLATE NOCASE"
        : "instr(lower(set_name), lower(?)) > 0",
    );
    args.push(setName);
  }

  const cardId = search.cardId?.trim() ?? "";
  if (cardId) {
    where.push("instr(lower(id), lower(?)) > 0");
    args.push(cardId);
  }

  const cardNumber = search.cardNumber.trim();
  if (cardNumber) {
    const numerator = cardNumberNumerator(cardNumber);
    if (/^\d+$/.test(numerator)) {
      where.push(`(
        lower(trim(card_number)) = lower(?)
        OR (
          trim(
            CASE
              WHEN instr(card_number, '/') > 0
                THEN substr(card_number, 1, instr(card_number, '/') - 1)
              ELSE card_number
            END
          ) NOT GLOB '*[^0-9]*'
          AND CAST(
            CASE
              WHEN instr(card_number, '/') > 0
                THEN substr(card_number, 1, instr(card_number, '/') - 1)
              ELSE card_number
            END AS INTEGER
          ) = ?
        )
      )`);
      args.push(cardNumber, Number(numerator));
    } else {
      where.push("lower(trim(card_number)) = lower(?)");
      args.push(cardNumber);
    }
  }

  const rarity = search.rarity?.trim() ?? "";
  if (rarity) {
    where.push("rarity = ? COLLATE NOCASE");
    args.push(rarity);
  }

  const condition = search.condition || "NEAR_MINT";
  const priceExpression = `CAST(json_extract(raw_json, '${CONDITION_PATHS[condition]}') AS REAL)`;
  if (search.condition) where.push(`${priceExpression} IS NOT NULL`);
  if (search.minPrice !== undefined) {
    where.push(`${priceExpression} >= ?`);
    args.push(search.minPrice);
  }
  if (search.maxPrice !== undefined) {
    where.push(`${priceExpression} <= ?`);
    args.push(search.maxPrice);
  }

  const result = await database.execute({
    sql: `
      SELECT
        id,
        name,
        card_number,
        set_name,
        rarity,
        variant,
        image_url,
        json_extract(raw_json, '$.currency') AS currency,
        json_extract(raw_json, '$.prices.tcgplayer.NEAR_MINT.avg') AS near_mint_price,
        json_extract(raw_json, '$.prices.tcgplayer.LIGHTLY_PLAYED.avg') AS lightly_played_price,
        json_extract(raw_json, '$.prices.tcgplayer.MODERATELY_PLAYED.avg') AS moderately_played_price,
        json_extract(raw_json, '$.prices.tcgplayer.HEAVILY_PLAYED.avg') AS heavily_played_price,
        json_extract(raw_json, '$.prices.tcgplayer.DAMAGED.avg') AS damaged_price,
        tcg_market_comparisons
      FROM poketrace_cards
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY lower(name), lower(set_name), card_number, variant, id
      LIMIT ${POKETRACE_SEARCH_RESULT_LIMIT}
    `,
    args,
  });
  const cards = result.rows.map((row) =>
    toPokeTraceCatalogCard(row as unknown as Record<string, unknown>),
  );
  const items = searchPokeTraceCatalogCards(cards, search, {
    limit: POKETRACE_SEARCH_RESULT_LIMIT,
  }).map(toPokeTraceCatalogPokemonCard);

  return { items, total: items.length };
}
