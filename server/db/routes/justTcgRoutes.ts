import { Router, type Request, type Response } from "express";
import {
  fetchPokemonCards,
  JustTcgApiError,
} from "../../services/justTcgApi.js";

const router = Router();

router.get("/cards", async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit ?? 20);
    const offset = Number(req.query.offset ?? 0);
    const orderBy =
      typeof req.query.orderBy === "string" ? req.query.orderBy : "price";
    const order =
      req.query.order === "asc" || req.query.order === "desc"
        ? req.query.order
        : "desc";
    const query =
      typeof req.query.q === "string" && req.query.q.trim()
        ? req.query.q.trim()
        : undefined;

    const data = await fetchPokemonCards({
      limit: Number.isFinite(limit) ? limit : 20,
      offset: Number.isFinite(offset) ? offset : 0,
      orderBy,
      order,
      query,
    });

    res.json(data);
  } catch (err) {
    console.error("JustTCG cards route failed:", err);

    const statusCode = err instanceof JustTcgApiError ? err.statusCode : 500;

    res.status(statusCode).json({
      error:
        err instanceof JustTcgApiError
          ? err.message
          : "JustTCG cards request failed",
    });
  }
});

export default router;