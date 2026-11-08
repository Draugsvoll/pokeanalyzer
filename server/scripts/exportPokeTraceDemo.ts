import {
  loadPokeTraceCard,
  loadPokeTracePriceHistory,
} from "../db/routes/pokeTraceRoutes.js";
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ensurePokeTraceReady, pokeTraceDb } from "../db/pokeTraceDb.js";
import { loadMarketPriceHistory } from "../services/pokeTraceMarketPriceHistory.js";

const DEMO_SOURCE_CARD_ID = "019c0001-f4af-73e0-bbc7-f1036725cbc5";
const demoPath = path.resolve("public/demo-card.json");
const databaseUrl = process.env.POKETRACE_DATABASE_URL_V2?.trim();

if (!databaseUrl || databaseUrl.startsWith("file:")) {
  throw new Error("Set POKETRACE_DATABASE_URL_V2 to the Turso database");
}
await ensurePokeTraceReady();

try {
  // Use exactly the same card loader as GET /api/cards/:id.
  const card = await loadPokeTraceCard(DEMO_SOURCE_CARD_ID);
  if (!card) throw new Error("The demo source card is missing");
  const marketPriceHistory = await loadMarketPriceHistory(DEMO_SOURCE_CARD_ID);
  if (!marketPriceHistory) {
    throw new Error("Price history for the demo source card is missing");
  }

  const priceHistory = await loadPokeTracePriceHistory(DEMO_SOURCE_CARD_ID, 9);
  if (!priceHistory?.snapshots.length) {
    throw new Error(
      "Daily price snapshots for the demo source card are missing",
    );
  }

  const demoCard = {
    ...card,
    id: "demo",
    pokeTrace: {
      ...card.pokeTrace,
      priceHistory: { ...priceHistory, cardId: "demo" },
      marketPriceHistory: {
        ...marketPriceHistory,
        cardId: "demo",
      },
      variants: card.pokeTrace.variants.map((variant) => ({
        ...variant,
        id: variant.id === DEMO_SOURCE_CARD_ID ? "demo" : variant.id,
      })),
    },
  };

  await writeFile(demoPath, `${JSON.stringify(demoCard, null, 2)}\n`, "utf8");
  console.log(`Wrote ${demoPath} with marketplace price history`);
} finally {
  pokeTraceDb.close();
}
