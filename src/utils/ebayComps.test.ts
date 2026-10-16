import { expect, test } from "vitest";
import { getVisibleEbayCompResults } from "./ebayComps";

test("preserves the full resolution image without displaying it as metadata", () => {
  const [result] = getVisibleEbayCompResults({
    items: [
      {
        thumbnailUrl: "https://example.com/small.jpg",
        fullResThumbnailUrl: "https://example.com/large.jpg",
        title: "Charizard",
      },
    ],
  });
  expect(result.fullResThumbnailUrl).toBe("https://example.com/large.jpg");
  expect(result.fields).toEqual([{ key: "title", value: "Charizard" }]);
});

test.each([undefined, null, "", "N/A", true])(
  "handles unavailable full resolution image: %s",
  (fullResThumbnailUrl) => {
    const [result] = getVisibleEbayCompResults([{ fullResThumbnailUrl }]);
    expect(result.fullResThumbnailUrl).toBeNull();
  },
);
