const CATALOG_REFRESH_TIMEOUT_MS = 60_000;

type CatalogRefreshRequestOptions = {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  token?: string;
};

export async function requestPokeTraceCatalogRefresh(
  options: CatalogRefreshRequestOptions = {},
) {
  try {
    const endpoint = (
      options.endpoint ?? process.env.POKETRACE_CATALOG_REFRESH_URL
    )?.trim();
    const token = (
      options.token ?? process.env.POKETRACE_CATALOG_REFRESH_TOKEN
    )?.trim();

    if (!endpoint || !token) {
      throw new Error(
        "POKETRACE_CATALOG_REFRESH_URL and POKETRACE_CATALOG_REFRESH_TOKEN must be configured together",
      );
    }

    const url = new URL(endpoint);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("POKETRACE_CATALOG_REFRESH_URL must use HTTP or HTTPS");
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? CATALOG_REFRESH_TIMEOUT_MS,
    );

    let response: Response;
    try {
      response = await (options.fetchImpl ?? fetch)(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        redirect: "error",
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("PokeTrace catalog refresh request timed out", {
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(
        `PokeTrace catalog refresh request failed with HTTP ${response.status}`,
      );
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Catalogue warmup failed: ${reason}`, { cause: error });
  }
}
