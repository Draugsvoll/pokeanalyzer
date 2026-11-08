import { expect, test } from "vitest";
import {
  isEligibleGradedPrice,
  resolveGradedPrice,
} from "../../shared/gradedPrice";

test.each([
  [{ median30d: 300, median7d: 200, avg: 100 }, 300],
  [{ median30d: null, median7d: 200, avg: 100 }, 200],
  [{ avg: 100 }, 100],
  [{ median30d: NaN, median7d: Infinity, avg: 100 }, 100],
  [{ median30d: -1, median7d: "200", avg: 100 }, 100],
  [{ median30d: 0, median7d: 200, avg: 100 }, 0],
  [{}, null],
])("resolves graded prices consistently: %j", (price, expected) => {
  expect(resolveGradedPrice(price)).toBe(expected);
});

test.each([
  [{ saleCount: 15, median3d: 100, median7d: 100, median30d: 100 }, false],
  [{ saleCount: 15, median3d: 100, median7d: 100, median30d: 110 }, true],
  [{ saleCount: 15, median3d: null, median7d: null, median30d: null }, true],
  [{ saleCount: 15, median7d: 100, avg: 110 }, true],
  [{ saleCount: 14, avg: 110 }, false],
  [{ saleCount: null, avg: 110 }, false],
  [{ saleCount: NaN, avg: 110 }, false],
  [{ saleCount: Infinity, avg: 110 }, false],
  [{ avg: 110 }, false],
])("shares graded-price eligibility: %j", (price, expected) => {
  expect(isEligibleGradedPrice(price)).toBe(expected);
});
