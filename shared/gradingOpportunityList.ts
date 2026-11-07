export const GRADING_LIST_BROWSER_TTL_MS = 6 * 60 * 60 * 1_000;
export const GRADING_LIST_SERVER_TTL_MS = 24 * 60 * 60 * 1_000;
export const GRADING_LIST_MAX_AGE_MS = 48 * 60 * 60 * 1_000;

export type GradingOpportunityList = {
  schemaVersion: 2;
  generatedAt: string;
  items: { cardId: string; psa10Price: number }[];
};

export function parseGradingOpportunityList(
  value: unknown,
): GradingOpportunityList {
  if (!value || typeof value !== "object")
    throw new Error("Invalid grading opportunity list");
  const data = value as Partial<GradingOpportunityList>;
  if (
    data.schemaVersion !== 2 ||
    typeof data.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(data.generatedAt)) ||
    !Array.isArray(data.items)
  ) {
    throw new Error("Invalid grading opportunity list");
  }
  const ids = new Set<string>();
  for (const item of data.items) {
    if (
      !item ||
      typeof item.cardId !== "string" ||
      !item.cardId.trim() ||
      ids.has(item.cardId) ||
      typeof item.psa10Price !== "number" ||
      !Number.isFinite(item.psa10Price) ||
      item.psa10Price <= 0
    ) {
      throw new Error("Invalid grading opportunity list item");
    }
    ids.add(item.cardId);
  }
  return data as GradingOpportunityList;
}

export function isGradingOpportunityListFresh(
  list: GradingOpportunityList,
  now = Date.now(),
) {
  const age = now - Date.parse(list.generatedAt);
  return Number.isFinite(age) && age >= 0 && age < GRADING_LIST_MAX_AGE_MS;
}
