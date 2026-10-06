import { describe, expect, test } from "vitest";
import {
  monotoneAreaPath,
  monotoneLinePath,
  type ChartPoint,
} from "./marketPriceHistoryPaths";

function cubicControlYs(path: string) {
  return [...path.matchAll(/C\s+\S+\s+(\S+)\s+\S+\s+(\S+)\s+\S+\s+(\S+)/g)].map(
    (match) => match.slice(1).map(Number),
  );
}

describe("monotoneLinePath", () => {
  test.each([
    [
      "increasing",
      [
        { x: 0, y: 0 },
        { x: 5, y: 8 },
        { x: 20, y: 10 },
        { x: 30, y: 30 },
      ],
    ],
    [
      "decreasing",
      [
        { x: 0, y: 30 },
        { x: 10, y: 20 },
        { x: 15, y: 4 },
        { x: 30, y: 0 },
      ],
    ],
  ])("does not overshoot a %s series", (_label, points: ChartPoint[]) => {
    const segments = cubicControlYs(monotoneLinePath(points, points.at(-1)!.x));

    expect(segments).toHaveLength(points.length - 1);
    segments.forEach(([firstControlY, secondControlY, endY], index) => {
      const startY = points[index].y;
      const expectedEndY = points[index + 1].y;
      const lower = Math.min(startY, expectedEndY);
      const upper = Math.max(startY, expectedEndY);

      expect(firstControlY).toBeGreaterThanOrEqual(lower);
      expect(firstControlY).toBeLessThanOrEqual(upper);
      expect(secondControlY).toBeGreaterThanOrEqual(lower);
      expect(secondControlY).toBeLessThanOrEqual(upper);
      expect(endY).toBe(expectedEndY);
    });
  });

  test("uses a finite line segment for repeated x positions", () => {
    const path = monotoneLinePath(
      [
        { x: 4, y: 10 },
        { x: 4, y: 12 },
        { x: 10, y: 16 },
      ],
      10,
    );

    expect(path).toContain("L 4.00 12.00");
    expect(path).toContain("C ");
    expect(path).not.toMatch(/NaN|Infinity/);
  });

  test("returns a valid move command for one point", () => {
    expect(monotoneLinePath([{ x: 5, y: 12 }], 5)).toBe("M 5.00 12.00");
  });

  test("carries the final value horizontally to the requested end", () => {
    expect(
      monotoneLinePath(
        [
          { x: 2, y: 7 },
          { x: 8, y: 9 },
        ],
        20,
      ),
    ).toMatch(/L 20\.00 9\.00$/);
  });
});

describe("monotoneAreaPath", () => {
  test("closes a carried trailing value against the baseline", () => {
    expect(monotoneAreaPath([{ x: 8, y: 9 }], 20, 30)).toBe(
      "M 8.00 9.00 L 20.00 9.00 L 20.00 30.00 L 8.00 30.00 Z",
    );
  });
});
