import { describe, expect, it } from "vitest";
import {
  formatCardNumber,
  formatUnpaddedCardNumber,
} from "../../shared/formatCardNumber";

describe("formatCardNumber", () => {
  it("pads a numeric fraction supplied by the catalog", () => {
    expect(formatCardNumber({ number: "5/109" })).toBe("005/109");
  });

  it("keeps an already padded numeric fraction unchanged", () => {
    expect(formatCardNumber({ number: "005/109" })).toBe("005/109");
  });

  it("leaves special card-number formats unchanged", () => {
    expect(formatCardNumber({ number: "RC1/RC25" })).toBe("RC1/RC25");
  });

  it("does not alter fractions in the explicitly unpadded formatter", () => {
    expect(formatUnpaddedCardNumber({ number: "5/109" })).toBe("5/109");
  });
});
