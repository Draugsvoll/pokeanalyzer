const CATALOG_REFRESH_TIMEOUT_MS = 60_000;

type CatalogRefreshRequestOptions = {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  token?: string;
};

type CatalogRefreshRequestConfiguration = {
  endpointEnvironmentVariable: string;
  requestLabel: string;
};

async function requestCatalogRefresh(
  options: CatalogRefreshRequestOptions,
  configuration: CatalogRefreshRequestConfiguration,
) {
  const endpoint = (
    options.endpoint ?? process.env[configuration.endpointEnvironmentVariable]
  )?.trim();
  const token = (
    options.token ?? process.env.POKETRACE_CATALOG_REFRESH_TOKEN
  )?.trim();

  if (!endpoint || !token) {
    throw new Error(
      `${configuration.endpointEnvironmentVariable} and POKETRACE_CATALOG_REFRESH_TOKEN must be configured together`,
    );
  }

  const url = new URL(endpoint);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `${configuration.endpointEnvironmentVariable} must use HTTP or HTTPS`,
    );
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
      throw new Error(`${configuration.requestLabel} request timed out`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(
      `${configuration.requestLabel} request failed with HTTP ${response.status}`,
    );
  }
}

export async function requestPokeTraceCatalogRefresh(
  options: CatalogRefreshRequestOptions = {},
) {
  try {
    await requestCatalogRefresh(options, {
      endpointEnvironmentVariable: "POKETRACE_CATALOG_REFRESH_URL",
      requestLabel: "PokeTrace catalog refresh",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Catalogue warmup failed: ${reason}`, { cause: error });
  }
}

export async function requestPokeTraceSealedCatalogRefresh(
  options: CatalogRefreshRequestOptions = {},
) {
  try {
    await requestCatalogRefresh(options, {
      endpointEnvironmentVariable: "POKETRACE_SEALED_CATALOG_REFRESH_URL",
      requestLabel: "PokeTrace sealed catalog refresh",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Sealed catalogue warmup failed: ${reason}`, {
      cause: error,
    });
  }
}
