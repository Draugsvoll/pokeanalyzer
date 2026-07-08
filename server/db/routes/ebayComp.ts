import express from "express";
import { fetchEbayComps } from "../../services/ebayCompsApi";

const router = express.Router();

router.get("/ebay", async (req, res) => {
  try {
    const query = String(req.query.q ?? "");

    if (!query) {
      return res.status(400).json({ error: "Missing query" });
    }

    const data = await fetchEbayComps(query);

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch EbayComps data" });
  }
});


export default router;
