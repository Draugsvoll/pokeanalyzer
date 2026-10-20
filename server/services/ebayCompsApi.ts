export type EbayCompsOptions = {
  titleFilter?: EbayCardSearchContext;
  sold?: boolean;
};

type EbayCardSearchContext = {
  cardName: string;
  cardNumber: string;
};

export function buildEbayCardRequests(context: EbayCardSearchContext) {
  const { cardName, cardNumber } = context;
  const query = [cardName, cardNumber].filter(Boolean).join(" ");
  const soldOptions: EbayCompsOptions = {
    titleFilter: { cardName, cardNumber },
  };

  return {
    query,
    soldOptions,
    activeOptions: { ...soldOptions, sold: false } satisfies EbayCompsOptions,
  };
}

export function buildEbayCompsUrl(
  apiUrl: string,
  apiParam: string,
  query: string,
  options: EbayCompsOptions = {},
) {
  const params = new URLSearchParams({
    [apiParam]: query,
    categoryId: "183454",
    count: "200",
    page: "1",
  });
  if (options.sold === false) params.set("sold", "false");

  return `${apiUrl}?${params.toString()}`;
}

function normalizeTitleTokens(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function filterEbayCompsResponseByTitle(
  response: unknown,
  { cardName, cardNumber }: EbayCardSearchContext,
) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return response;
  }

  const record = response as Record<string, unknown>;
  if (!Array.isArray(record.items)) return response;

  const firstNameToken = normalizeTitleTokens(cardName)[0];
  const number = cardNumber.trim().toLocaleLowerCase("en-US");
  const items = record.items.filter((item) => {
    if (!item || typeof item !== "object" || typeof item.title !== "string") {
      return false;
    }
    return (
      (number !== "" && item.title.toLocaleLowerCase("en-US").includes(number)) ||
      (firstNameToken !== undefined &&
        normalizeTitleTokens(item.title).includes(firstNameToken))
    );
  });

  return { ...record, items, totalItems: items.length };
}

export async function fetchEbayComps(
  query: string,
  signal?: AbortSignal,
  options: EbayCompsOptions = {},
) {
  const apiKey = process.env.EBAYCOMPS_API_KEY;
  const api_url =
    process.env.EBAYCOMPS_API_URL || "https://api.sold-comps.com/v1/scrape";
  const api_param = process.env.EBAYCOMPS_API_PARAM || "keyword";

  if (!apiKey) {
    throw new Error("Missing EBAYCOMPS_API_KEY");
  }

  const url = buildEbayCompsUrl(api_url, api_param, query, options);

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

  const response: unknown = await res.json();
  return options.titleFilter
    ? filterEbayCompsResponseByTitle(response, options.titleFilter)
    : response;
}
