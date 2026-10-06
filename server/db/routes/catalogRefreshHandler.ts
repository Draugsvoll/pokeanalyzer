import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { logError } from "../../security/logging.js";

type CatalogRefreshHandlerOptions = {
  errorContext: string;
  failureMessage: string;
  refreshCatalog: () => Promise<unknown>;
  refreshToken?: string;
  reportError?: (context: string, error: unknown) => void;
};

function tokensMatch(provided: string, expected: string) {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export function createCatalogRefreshHandler({
  errorContext,
  failureMessage,
  refreshCatalog,
  refreshToken = process.env.POKETRACE_CATALOG_REFRESH_TOKEN,
  reportError = logError,
}: CatalogRefreshHandlerOptions): RequestHandler {
  const expectedToken = refreshToken?.trim();

  return async (req, res) => {
    if (!expectedToken) {
      res.status(503).json({ error: "Catalog refresh is not configured" });
      return;
    }

    const authorization = req.header("authorization") ?? "";
    const providedToken =
      authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
    if (!providedToken || !tokensMatch(providedToken, expectedToken)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      await refreshCatalog();
      res.status(204).end();
    } catch (error) {
      reportError(errorContext, error);
      res.status(500).json({ error: failureMessage });
    }
  };
}
