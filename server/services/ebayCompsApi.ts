export type EbayCompsOptions = {
  aspectFilter?: Record<string, string>;
  requiredTitle?: string;
  sold?: boolean;
};

type EbayCardSearchContext = {
  cardName: string;
  cardNumber: string;
  formattedCardNumber: string;
  setName: string;
  unpaddedCardNumber: string;
};

export function buildEbayCardRequests(context: EbayCardSearchContext) {
  const cardNumberCandidates = [
    context.formattedCardNumber,
    context.unpaddedCardNumber,
    context.cardNumber,
  ].filter((value, index, values) => value && values.indexOf(value) === index);
  const cardNumberQuery =
    cardNumberCandidates.length > 1
      ? `(${cardNumberCandidates.join(",")})`
      : cardNumberCandidates[0];
  const query = [context.cardName, cardNumberQuery, context.setName]
    .filter(Boolean)
    .join(" ");
  const soldOptions: EbayCompsOptions = {
    aspectFilter: { Set: context.setName },
    requiredTitle: context.cardName,
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
  if (options.aspectFilter) {
    params.set("aspectFilter", JSON.stringify(options.aspectFilter));
  }
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

function titleContainsName(title: string, requiredName: string) {
  const titleTokens = normalizeTitleTokens(title);
  const nameTokens = normalizeTitleTokens(requiredName);
  if (nameTokens.length === 0 || nameTokens.length > titleTokens.length) {
    return false;
  }

  return titleTokens.some((_, startIndex) =>
    nameTokens.every(
      (token, tokenIndex) => titleTokens[startIndex + tokenIndex] === token,
    ),
  );
}

export function filterEbayCompsResponseByTitle(
  response: unknown,
  requiredTitle: string,
) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return response;
  }

  const record = response as Record<string, unknown>;
  if (!Array.isArray(record.items)) return response;

  const items = record.items.filter(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).title === "string" &&
      titleContainsName(
        (item as Record<string, unknown>).title as string,
        requiredTitle,
      ),
  );

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
  return options.requiredTitle
    ? filterEbayCompsResponseByTitle(response, options.requiredTitle)
    : response;
}
