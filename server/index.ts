import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { db } from "./db/db.js";
import grokRoutes from "./db/routes/grokRoutes.js";
import openaiRoutes from "./db/routes/openaiRoutes.js";
import { fetchEbayComps } from "./services/ebayCompsApi.js";
import { fetchJustTcgCard, JustTcgApiError } from "./services/justTcgApi.js";
import subscriptionRoutes from "./subscriptions/subscriptionRoutes.js";

const app = express();

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 per minutt
  max: 200, // per minutt
  standardHeaders: true,
  legacyHeaders: false,
});

const ebayLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

const grokLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many Grok requests. Please wait and try again." },
});

app.use(cors());
app.use(express.json({ limit: "30mb" }));
app.use(limiter);
app.use("/grok", grokLimiter, grokRoutes);
app.use("/openai", openaiRoutes);
app.use("/api/subscription", subscriptionRoutes);

app.get("/ebay", ebayLimiter, async (req, res) => {
  try {
    const query =
    typeof req.query.q === "string" ? req.query.q : "pokemon charizard";

    const data = await fetchEbayComps(query);

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

const ALLOWED_IMAGE_HOSTS = new Set(["images.pokemontcg.io"]);

function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_IMAGE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

app.get("/api/image/proxy", async (req, res) => {
  try {
    const imageUrl =
      typeof req.query.url === "string" ? req.query.url.trim() : "";

    if (!imageUrl || !isAllowedImageUrl(imageUrl)) {
      res.status(400).json({ error: "Invalid image url" });
      return;
    }

    const imageResponse = await fetch(imageUrl);

    if (!imageResponse.ok) {
      res.status(502).json({ error: "Failed to fetch image" });
      return;
    }

    const contentType = imageResponse.headers.get("content-type") ?? "image/png";
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch (err) {
    console.error("Image proxy failed:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Image proxy failed",
    });
  }
});

// FETCH ALL CARDS
app.get("/api/cards", (_req, res) => {
  db.all(
    `
    SELECT raw_json
    FROM cards
    LIMIT 10
    `,
    [],
    (err, rows: { raw_json: string }[]) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      const cards = rows.map((row) => JSON.parse(row.raw_json));
      res.json(cards);
    }
  );
});

app.get("/api/justtcg-card", async (req, res) => {
  const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
  const number = typeof req.query.number === "string" ? req.query.number.trim() : "";

  if (!name || !number) {
    res.status(400).json({ message: "name and number are required" });
    return;
  }

  try {
    res.json(await fetchJustTcgCard(name, number));
  } catch (error) {
    console.error("JustTCG API request failed:", error);
    res.status(error instanceof JustTcgApiError ? error.statusCode : 502).json({
      message: error instanceof Error ? error.message : "JustTCG API request failed",
    });
  }
});

// SEARCH FUNCTION
app.get("/api/cards/search", (req, res) => {
  const pokemonName =
    typeof req.query.pokemonName === "string" ? req.query.pokemonName.trim() : "";
  const setName =
    typeof req.query.setName === "string" ? req.query.setName.trim() : "";
  const setSeries =
    typeof req.query.setSeries === "string" ? req.query.setSeries.trim() : "";
  const cardNumber =
    typeof req.query.cardNumber === "string" ? req.query.cardNumber.trim() : "";
  const rarity =
    typeof req.query.rarity === "string" ? req.query.rarity.trim() : "";
  const nationalPokedexNumbers =
    typeof req.query.nationalPokedexNumbers === "string"
      ? req.query.nationalPokedexNumbers.trim()
      : "";
  const cardId =
    typeof req.query.cardId === "string" ? req.query.cardId.trim() : "";
  const conditions: string[] = [];
  const params: (number | string)[] = [];

  if (pokemonName) {
    conditions.push("name LIKE ?");
    params.push(`%${pokemonName}%`);
  }

  if (setName) {
    conditions.push("set_name LIKE ?");
    params.push(`%${setName}%`);
  }

  if (setSeries) {
    conditions.push("json_extract(raw_json, '$.set.series') LIKE ?");
    params.push(`%${setSeries}%`);
  }

  if (cardNumber) {
    conditions.push("number = ?");
    params.push(cardNumber);
  }

  if (rarity) {
    conditions.push("json_extract(raw_json, '$.rarity') LIKE ?");
    params.push(`%${rarity}%`);
  }

  if (nationalPokedexNumbers) {
    const pokedexNumber = Number(nationalPokedexNumbers);

    if (!Number.isNaN(pokedexNumber)) {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM json_each(cards.raw_json, '$.nationalPokedexNumbers')
          WHERE json_each.value = ?
        )
      `);
      params.push(pokedexNumber);
    }
  }

  if (cardId) {
    conditions.push("id LIKE ?");
    params.push(`%${cardId}%`);
  }

  if (conditions.length === 0) {
    res.status(400).json({ error: "At least one search field is required" });
    return;
  }

  const sql = `
    SELECT raw_json
    FROM cards
    WHERE ${conditions.join(" AND ")}
    LIMIT 20
  `;

  db.all(sql, params, (err, rows: { raw_json: string }[]) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    const cards = rows.map((row) => JSON.parse(row.raw_json));
    res.json(cards);
  });
});

// FETCH SINGLE CARD BY ID
app.get("/api/cards/:id", (req, res) => {
  db.get(
    `
    SELECT raw_json
    FROM cards
    WHERE id = ?
    `,
    [req.params.id],
    (err, row: { raw_json: string } | undefined) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (!row) {
        res.status(404).json({ error: "Card not found" });
        return;
      }
      res.json(JSON.parse(row.raw_json));
    }
  );
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
