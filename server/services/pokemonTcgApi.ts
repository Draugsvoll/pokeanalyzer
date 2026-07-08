import axios from "axios";
import type { PokemonTcgApiCard } from "../types/PokemonTcgApiCard";
import type { PokemonTcgApiResponse } from "../types/PokemonTcgApiResponse";

const API_URL = "https://api.pokemontcg.io/v2/cards";
const PAGE_SIZE = 250;
const REQUEST_DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitBetweenRequests(): Promise<void> {
  await sleep(REQUEST_DELAY_MS);
}

export async function getCardsPage(page: number): Promise<PokemonTcgApiCard[]> {
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await axios.get<PokemonTcgApiResponse>(API_URL, {
        params: {
          page,
          pageSize: PAGE_SIZE,
        },
        timeout: 30000,
        headers: process.env.POKEMON_TCG_API_KEY
          ? { "X-Api-Key": process.env.POKEMON_TCG_API_KEY }
          : {},
      });

      return res.data.data;
    } catch (err) {
      console.log(`Page ${page} failed. Attempt ${attempt}/${maxRetries}`);

      if (attempt === maxRetries) {
        throw err;
      }

      await sleep(5000 * attempt);
    }
  }

  return [];
}

export { PAGE_SIZE };