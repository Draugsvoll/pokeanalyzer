export const GRADES = [10, 9, 8, 7] as const;

export type Grade = (typeof GRADES)[number];

export const DEFAULT_PROBABILITIES: Record<Grade, number> = {
  10: 15,
  9: 35,
  8: 35,
  7: 15,
};

export const DEFAULT_GRADING_FEE = 59;
export const DEFAULT_SHIPPING = 35;

export type GradeInputs = {
  expectedPrice: number | null;
  gradingFee: number | null;
  shipping: number | null;
  ebayFees: number | null;
};

export function gradeCost(inputs: GradeInputs) {
  return (
    (inputs.gradingFee ?? 0) + (inputs.shipping ?? 0) + (inputs.ebayFees ?? 0)
  );
}

export function gradeProfit(inputs: GradeInputs) {
  if (inputs.expectedPrice == null) return null;
  return inputs.expectedPrice - gradeCost(inputs);
}

export function gradeRoi(inputs: GradeInputs) {
  const profit = gradeProfit(inputs);
  const cost = gradeCost(inputs);
  if (profit == null || cost <= 0) return null;
  return profit / cost;
}

export function weightedResult(
  grades: Record<Grade, GradeInputs & { probability: number }>,
) {
  const included = GRADES.filter(
    (grade) => grades[grade].expectedPrice != null,
  );
  if (included.length === 0) return { profit: null, roi: null };

  const profit = included.reduce(
    (sum, grade) =>
      sum +
      (grades[grade].probability / 100) * (gradeProfit(grades[grade]) ?? 0),
    0,
  );
  const cost = included.reduce(
    (sum, grade) =>
      sum + (grades[grade].probability / 100) * gradeCost(grades[grade]),
    0,
  );
  return { profit, roi: cost > 0 ? profit / cost : null };
}

export function adjustProbability(
  current: Record<Grade, number>,
  grade: Grade,
  nextValue: number,
  locked: ReadonlySet<Grade> = new Set(),
) {
  const others = GRADES.filter((item) => item !== grade);
  const unlocked = others.filter((item) => !locked.has(item));
  const lockedTotal = others
    .filter((item) => locked.has(item))
    .reduce((sum, item) => sum + current[item], 0);
  const available = unlocked.length === 0 ? current[grade] : 100 - lockedTotal;
  const next = Math.min(clampPercent(nextValue), available);
  const result = { ...current, [grade]: next };
  if (unlocked.length === 0) return result;

  const values = { ...current };
  const delta =
    100 -
    next -
    lockedTotal -
    unlocked.reduce((sum, item) => sum + current[item], 0);
  shareEvenly(unlocked, values, delta);
  unlocked.forEach((item) => {
    result[item] = values[item];
  });
  return result;
}

export function applyDisplayedProbabilities(
  stored: Record<Grade, number>,
  displayed: Record<Grade, number>,
  priced: readonly Grade[],
) {
  const next = { ...stored };
  if (priced.length === 0) return next;
  const storedSum = priced.reduce(
    (sum, grade) => sum + Math.max(0, stored[grade]),
    0,
  );
  const displayedSum = priced.reduce(
    (sum, grade) => sum + Math.max(0, displayed[grade]),
    0,
  );
  if (storedSum <= 0 || displayedSum <= 0) {
    priced.forEach((grade) => {
      next[grade] = Math.max(0, displayed[grade]);
    });
    return next;
  }
  const parts = priced.map((grade) => {
    const exact = (Math.max(0, displayed[grade]) * storedSum) / displayedSum;
    const floor = Math.floor(exact);
    return { grade, floor, fraction: exact - floor };
  });
  let used = 0;
  parts.forEach((part) => {
    next[part.grade] = part.floor;
    used += part.floor;
  });
  [...parts]
    .sort(
      (a, b) =>
        b.fraction - a.fraction ||
        priced.indexOf(a.grade) - priced.indexOf(b.grade),
    )
    .forEach((part) => {
      if (used >= storedSum) return;
      next[part.grade] += 1;
      used += 1;
    });
  return next;
}

export function probabilitiesForPricedGrades(
  current: Record<Grade, number>,
  priced: readonly Grade[],
) {
  if (priced.length === 0) return { 10: 0, 9: 0, 8: 0, 7: 0 };
  const next: Record<Grade, number> = { 10: 0, 9: 0, 8: 0, 7: 0 };
  if (priced.length === 1) {
    next[priced[0]] = 100;
    return next;
  }
  const sum = priced.reduce(
    (total, grade) => total + Math.max(0, current[grade]),
    0,
  );
  if (sum <= 0) {
    const base = Math.floor(100 / priced.length);
    let remainder = 100 - base * priced.length;
    priced.forEach((grade) => {
      next[grade] = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
    });
    return next;
  }
  const parts = priced.map((grade) => {
    const exact = (Math.max(0, current[grade]) * 100) / sum;
    const floor = Math.floor(exact);
    return { grade, floor, fraction: exact - floor };
  });
  let used = 0;
  parts.forEach((part) => {
    next[part.grade] = part.floor;
    used += part.floor;
  });
  [...parts]
    .sort(
      (a, b) =>
        b.fraction - a.fraction ||
        priced.indexOf(a.grade) - priced.indexOf(b.grade),
    )
    .forEach((part) => {
      if (used >= 100) return;
      next[part.grade] += 1;
      used += 1;
    });
  return next;
}

function shareEvenly(
  grades: Grade[],
  values: Record<Grade, number>,
  delta: number,
) {
  const direction = delta > 0 ? 1 : -1;
  let remaining = Math.abs(delta);
  let active = grades.filter((grade) => direction === 1 || values[grade] > 0);

  while (remaining > 0 && active.length > 0) {
    const share = Math.floor(remaining / active.length);
    const extra = remaining % active.length;
    let consumed = 0;
    const nextActive: Grade[] = [];
    active.forEach((grade, index) => {
      const want = share + (index < extra ? 1 : 0);
      if (want === 0) {
        nextActive.push(grade);
        return;
      }
      const applied = direction === 1 ? want : Math.min(values[grade], want);
      values[grade] += direction * applied;
      consumed += applied;
      if (direction === 1 || values[grade] > 0) nextActive.push(grade);
    });
    if (consumed === 0) break;
    remaining -= consumed;
    active = nextActive;
  }
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function moneyInputValue(value: number) {
  return String(roundMoney(value));
}

export function parseMoney(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function readMarketAverage(prices: unknown, source: string, key: string) {
  if (!prices || typeof prices !== "object") return null;
  const market = (prices as Record<string, unknown>)[source];
  if (!market || typeof market !== "object") return null;
  const tier = (market as Record<string, unknown>)[key];
  if (!tier || typeof tier !== "object") return null;
  const average = (tier as { avg?: unknown }).avg;
  return typeof average === "number" && Number.isFinite(average) && average >= 0
    ? average
    : null;
}

export function readRawAverage(prices: unknown) {
  return readMarketAverage(prices, "tcgplayer", "NEAR_MINT");
}

function displayedPsaScore(gradeKey: string) {
  const [grader, ...scoreParts] = gradeKey.split("_");
  if (grader !== "PSA" || scoreParts.length === 0) return null;
  return scoreParts.join(".");
}

export function readGradedAverage(prices: unknown, grade: Grade) {
  if (!prices || typeof prices !== "object") return null;
  const ebay = (prices as Record<string, unknown>).ebay;
  if (!ebay || typeof ebay !== "object") return null;

  const score = String(grade);
  for (const [gradeKey, tier] of Object.entries(
    ebay as Record<string, unknown>,
  )) {
    if (displayedPsaScore(gradeKey) !== score) continue;
    if (!tier || typeof tier !== "object") return null;
    const average = (tier as { avg?: unknown }).avg;
    return typeof average === "number" &&
      Number.isFinite(average) &&
      average >= 0
      ? average
      : null;
  }
  return null;
}

export function seededGradeFields(expectedPrice: number | null) {
  return {
    expectedPrice: expectedPrice == null ? "" : moneyInputValue(expectedPrice),
    gradingFee: moneyInputValue(DEFAULT_GRADING_FEE),
    shipping: moneyInputValue(DEFAULT_SHIPPING),
    ebayFees: moneyInputValue(0),
  };
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
