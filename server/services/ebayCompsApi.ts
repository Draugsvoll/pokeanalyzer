export async function fetchEbayComps(query: string, signal?: AbortSignal) {
  const apiKey = process.env.EBAYCOMPS_API_KEY;
  const api_url = process.env.EBAYCOMPS_API_URL || "https://api.sold-comps.com/v1/scrape";
  const api_param = process.env.EBAYCOMPS_API_PARAM || "keyword";

  if (!apiKey) {
    throw new Error("Missing EBAYCOMPS_API_KEY");
  }

  const url = `${api_url}?${api_param}=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
      : AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`EbayComps request failed with status ${res.status}`);
  }

  return res.json();
}
