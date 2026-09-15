import { Router } from "express";
import { pkmnPricesDb, pkmnPricesReady } from "../pkmnPricesDb.js";
import { logError } from "../../security/logging.js";

const router = Router();

router.get("/search", async (req, res) => {
  const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
  if (name.length > 100) {
    res.status(400).json({ error: "Search is too long" });
    return;
  }

  try {
    await pkmnPricesReady;
    const result = await pkmnPricesDb.execute({
      sql: `
        SELECT id, name, number, set_name, rarity, image_url, fetched_at
        FROM pkmn_cards
        WHERE ? = '' OR instr(lower(name), lower(?)) > 0
        ORDER BY name, set_name, number
        LIMIT 50
      `,
      args: [name, name],
    });
    res.json(result.rows);
  } catch (error) {
    logError("Failed to search PkmnPrices cards", error);
    res.status(500).json({ error: "Failed to search cards" });
  }
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid card ID" });
    return;
  }

  try {
    await pkmnPricesReady;
    const result = await pkmnPricesDb.execute({
      sql: "SELECT raw_json, fetched_at FROM pkmn_cards WHERE id = ?",
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
    logError("Failed to fetch PkmnPrices card", error);
    res.status(500).json({ error: "Failed to fetch card" });
  }
});

export default router;
