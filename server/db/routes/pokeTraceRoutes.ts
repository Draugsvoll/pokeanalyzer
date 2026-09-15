import { Router } from "express";
import { pokeTraceDb, pokeTraceReady } from "../pokeTraceDb.js";
import { logError } from "../../security/logging.js";
import { POKETRACE_CARD_ID_PATTERN } from "../../services/pokeTraceApi.js";

const router = Router();

router.get("/search", async (req, res) => {
  const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
  if (name.length > 100) {
    res.status(400).json({ error: "Search is too long" });
    return;
  }
  try {
    await pokeTraceReady;
    const result = await pokeTraceDb.execute({
      sql: `
        SELECT id, name, card_number, set_name, rarity, variant, image_url
        FROM poketrace_cards
        WHERE ? = '' OR instr(lower(name), lower(?)) > 0
        ORDER BY name, set_name, card_number, variant
        LIMIT 50
      `,
      args: [name, name],
    });
    res.json(result.rows);
  } catch (error) {
    logError("Failed to search PokeTrace cards", error);
    res.status(500).json({ error: "Failed to search cards" });
  }
});

router.get("/:id", async (req, res) => {
  const id = req.params.id;
  if (typeof id !== "string" || !POKETRACE_CARD_ID_PATTERN.test(id)) {
    res.status(400).json({ error: "Invalid card ID" });
    return;
  }
  try {
    await pokeTraceReady;
    const result = await pokeTraceDb.execute({
      sql: "SELECT raw_json, fetched_at FROM poketrace_cards WHERE id = ?",
      args: [id],
    });
    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    res.json({
      ...JSON.parse(String(row.raw_json)),
      fetched_at: row.fetched_at,
    });
  } catch (error) {
    logError("Failed to fetch PokeTrace card", error);
    res.status(500).json({ error: "Failed to fetch card" });
  }
});

export default router;
