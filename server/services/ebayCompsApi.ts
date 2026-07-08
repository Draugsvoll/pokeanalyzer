export async function fetchEbayComps(query: string) {
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
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EbayComps failed: ${res.status} ${text}`);
  }

  return res.json();
}
