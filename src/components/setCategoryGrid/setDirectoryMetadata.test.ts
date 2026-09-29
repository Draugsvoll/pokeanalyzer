import { expect, test } from "vitest";
import { getSetDirectoryMetadata } from "./setDirectoryMetadata";

test("returns all available metadata for an exact set-name match", () => {
  expect(getSetDirectoryMetadata("Base Set")).toEqual({
    cardCount: 102,
    era: "Base",
    releaseYear: 1999,
  });
});

test("omits null and empty metadata fields", () => {
  expect(getSetDirectoryMetadata("Alternate Art Promos")).toEqual({
    era: "Promo",
  });
  expect(getSetDirectoryMetadata("Battles of Legend: Glorious Gallery")).toBe(
    null,
  );
});

test("returns no metadata when the set name has no exact match", () => {
  expect(getSetDirectoryMetadata("Unknown Set")).toBe(null);
});
