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
  query: string,
  options: EbayCompsOptions = {},
) {
  const params = new URLSearchParams({
    keyword: query,
    ebaySite: "ebay.com",
    categoryId: "183454",
    conditionId: "2750",
    count: "240",
    page: "1",
    bestOfferPrice: "true",
    relevance: "true",
    exactMatch: "false",
  });
  if (options.sold === false) params.set("sold", "false");

  return `https://api.compsniper.com/v1/scrape?${params.toString()}`;
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
      (number !== "" &&
        item.title.toLocaleLowerCase("en-US").includes(number)) ||
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
  const apiKey = process.env.COMPSNIPER_API_KEY;
  if (!apiKey) {
    throw new Error("COMPSNIPER_API_KEY is not configured");
  }

  const url = buildEbayCompsUrl(query, options);

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
    throw new Error(`CompSniper eBay request failed with status ${res.status}`);
  }

  const response: unknown = await res.json();
  return options.titleFilter
    ? filterEbayCompsResponseByTitle(response, options.titleFilter)
    : response;
}
