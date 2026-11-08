import { describe, expect, test } from "vitest";
import {
  adjustProbability,
  applyDisplayedProbabilities,
  probabilitiesForPricedGrades,
  gradeProfit,
  gradeRoi,
  readGradedPrice,
  weightedResult,
  type Grade,
  type GradeInputs,
} from "./gradeMath";

const inputs = (overrides: Partial<GradeInputs> = {}): GradeInputs => ({
  expectedPrice: 1000,
  gradingFee: 25,
  shipping: 20,
  ebayFees: 132.5,
  ...overrides,
});

describe("grading calculator", () => {
  test("subtracts the grade's own costs from its expected price", () => {
    expect(gradeProfit(inputs())).toBe(822.5);
    expect(gradeRoi(inputs())).toBeCloseTo(822.5 / 177.5);
  });

  test("uses the shared median priority for exact PSA grades", () => {
    const prices = {
      ebay: {
        PSA_10: { saleCount: 15, avg: 3350, median7d: 3550, median30d: 3600 },
        PSA_9: { saleCount: 15, median7d: 1900 },
        PSA_7: { saleCount: 15, avg: 1000 },
        PSA_8_5: { saleCount: 15, avg: 1775 },
      },
    };

    expect(readGradedPrice(prices, 10)).toBe(3600);
    expect(readGradedPrice(prices, 9)).toBe(1900);
    expect(readGradedPrice(prices, 8)).toBeNull();
    expect(readGradedPrice(prices, 7)).toBe(1000);
  });

  test("leaves an empty sell price out of the result", () => {
    expect(gradeProfit(inputs({ expectedPrice: null }))).toBeNull();
    expect(gradeRoi(inputs({ expectedPrice: null }))).toBeNull();
  });

  test("does not prefill a grade excluded from the graded price boxes", () => {
    expect(
      readGradedPrice(
        {
          ebay: {
            PSA_10: {
              avg: 150,
              saleCount: 15,
              median3d: 100,
              median7d: 100,
              median30d: 100,
            },
          },
        },
        10,
      ),
    ).toBeNull();
  });

  test.each([14, undefined])(
    "does not prefill a grade with insufficient or missing sales (%s)",
    (saleCount) => {
      expect(
        readGradedPrice({ ebay: { PSA_10: { avg: 500, saleCount } } }, 10),
      ).toBeNull();
    },
  );

  test("treats an empty cost as zero and hides ROI when nothing was spent", () => {
    expect(
      gradeProfit(inputs({ gradingFee: null, shipping: null, ebayFees: null })),
    ).toBe(1000);
    expect(
      gradeRoi(inputs({ gradingFee: null, shipping: null, ebayFees: null })),
    ).toBeNull();
  });

  test("weights only grades that have a sell price", () => {
    const grade = (
      probability: number,
      overrides: Partial<GradeInputs> = {},
    ) => ({ ...inputs(overrides), probability });
    const result = weightedResult({
      10: grade(15, { expectedPrice: null }),
      9: grade(35),
      8: grade(35, { expectedPrice: 500, ebayFees: 50 }),
      7: grade(15, { expectedPrice: null }),
    });
    const profit9 = 822.5;
    const profit8 = 500 - 25 - 20 - 50;
    expect(result.profit).toBeCloseTo(0.35 * profit9 + 0.35 * profit8);
    expect(result.roi).toBeCloseTo(
      (0.35 * profit9 + 0.35 * profit8) /
        (0.35 * 177.5 + 0.35 * (25 + 20 + 50)),
    );
  });

  test("shares a slider change equally across the other grades", () => {
    const next = adjustProbability({ 10: 15, 9: 35, 8: 35, 7: 15 }, 8, 25);
    expect(next).toEqual({ 10: 19, 9: 38, 8: 25, 7: 18 });
  });

  test("splits the remainder evenly when the other grades are zero", () => {
    const next = adjustProbability({ 10: 100, 9: 0, 8: 0, 7: 0 }, 10, 40);
    expect(next).toEqual({ 10: 40, 9: 20, 8: 20, 7: 20 });
  });

  test("gives the whole chance to one grade", () => {
    const next = adjustProbability({ 10: 15, 9: 35, 8: 35, 7: 15 }, 9, 100);
    expect(next).toEqual({ 10: 0, 9: 100, 8: 0, 7: 0 } satisfies Record<
      Grade,
      number
    >);
  });

  test("does not change a locked grade when another slider moves", () => {
    const next = adjustProbability(
      { 10: 15, 9: 35, 8: 35, 7: 15 },
      8,
      25,
      new Set<Grade>([10]),
    );
    expect(next[10]).toBe(15);
    expect(next[8]).toBe(25);
    expect(next[9] + next[7]).toBe(60);
  });

  test("shows zero chances when no grade has a price", () => {
    expect(
      probabilitiesForPricedGrades({ 10: 15, 9: 35, 8: 35, 7: 15 }, []),
    ).toEqual({ 10: 0, 9: 0, 8: 0, 7: 0 });
  });

  test("puts the full 100 percent on the only priced grade", () => {
    expect(
      probabilitiesForPricedGrades({ 10: 50, 9: 0, 8: 25, 7: 25 }, [10]),
    ).toEqual({ 10: 100, 9: 0, 8: 0, 7: 0 });
  });

  test("scales priced grades to 100 and drops grades without a price", () => {
    expect(
      probabilitiesForPricedGrades({ 10: 50, 9: 0, 8: 25, 7: 25 }, [10, 9]),
    ).toEqual({ 10: 100, 9: 0, 8: 0, 7: 0 });
    expect(
      probabilitiesForPricedGrades({ 10: 15, 9: 35, 8: 35, 7: 15 }, [10, 9]),
    ).toEqual({ 10: 30, 9: 70, 8: 0, 7: 0 });
  });

  test("keeps an unpriced grade's saved share when a slider moves", () => {
    expect(
      applyDisplayedProbabilities(
        { 10: 15, 9: 35, 8: 35, 7: 15 },
        { 10: 40, 9: 60, 8: 0, 7: 0 },
        [10, 9],
      ),
    ).toEqual({ 10: 20, 9: 30, 8: 35, 7: 15 });
  });

  test("keeps a dragged slider in the room left by locked grades", () => {
    const next = adjustProbability(
      { 10: 15, 9: 35, 8: 35, 7: 15 },
      8,
      80,
      new Set<Grade>([10, 9, 7]),
    );
    expect(next).toEqual({ 10: 15, 9: 35, 8: 35, 7: 15 });
  });
});
