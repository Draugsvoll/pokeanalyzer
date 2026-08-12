export type PortfolioPriceSource = "tcgplayer" | "cardmarket" | "justtcg";

export type PortfolioEntry = {
  cardId: string;
  quantity: number;
  priceSources?: Partial<Record<PortfolioPriceSource, string>>;
  allPriceSource?: PortfolioPriceSource;
};

export function buildSaveJustTcgPricesStatement(
  cardId: string,
  justtcg: { prices: Record<string, unknown>; updatedAt: string },
) {
  return {
    sql: `
      UPDATE cards
      SET raw_json = json_set(
            raw_json,
            '$.justtcg.prices',
            json(?),
            '$.justtcg.updatedAt',
            ?
          ),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    args: [JSON.stringify(justtcg.prices), justtcg.updatedAt, cardId],
  };
}

export function buildPortfolioPriceSourceSelectionUpdate(
  existing: PortfolioEntry,
  priceSource: PortfolioPriceSource,
  priceKey: string,
  selectForAll: boolean,
) {
  const priceSources = {
    ...(existing.priceSources ?? {}),
    [priceSource]: priceKey,
  };
  const entry = {
    ...existing,
    priceSources,
    ...(selectForAll && { allPriceSource: priceSource }),
  };
  const updates: Record<string, unknown> = {
    [`priceSources.${priceSource}`]: priceKey,
  };
  if (selectForAll) updates.allPriceSource = priceSource;

  return { entry, updates };
}
