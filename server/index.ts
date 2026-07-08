import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { db } from "./db/db.js";
import dotenv from "dotenv";
import grokRoutes from "./db/routes/grokRoutes.js";
import openaiRoutes from "./db/routes/openaiRoutes.js";
import { fetchEbayComps } from "./services/ebayCompsApi.js";
import {
  gradeCardImage,
  XimilarCardGraderError,
} from "./services/ximilarCardGraderApi.js";

dotenv.config();

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

const cardGraderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(limiter);
app.use("/grok", grokRoutes);
app.use("/openai", openaiRoutes);

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

app.post("/api/card-grader/grade", cardGraderLimiter, async (req, res) => {
  try {
    const imageBase64 =
      typeof req.body?.imageBase64 === "string" ? req.body.imageBase64 : "";

    if (!imageBase64) {
      res.status(400).json({ error: "imageBase64 is required" });
      return;
    }

    const cleanedBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const data = await gradeCardImage(cleanedBase64);

    res.json(data);
  } catch (err) {
    console.error("Card grader request failed");
    const statusCode =
      err instanceof XimilarCardGraderError ? err.statusCode : 500;

    res.status(statusCode).json({
      error:
        err instanceof XimilarCardGraderError
          ? err.message
          : "Card grading request failed",
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
