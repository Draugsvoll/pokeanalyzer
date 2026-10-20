import { expect, test, vi } from "vitest";
import { readEbaySearchStream } from "./ebaySearchStream";
import type { EbayCredits } from "../../shared/ebayCredits";
import type { EbaySearchEvent } from "../../shared/ebaySearch";

vi.mock("../utils/authenticatedFetch", () => ({ authenticatedFetch: vi.fn() }));

const credits: EbayCredits = {
  planId: "free",
  version: 1,
  membershipCreditsRemaining: 0,
  membershipCreditsTotal: 0,
  membershipCreditsUsed: 0,
  bonusCreditsRemaining: 9,
  bonusCreditsTotal: 10,
  bonusCreditsUsed: 1,
  creditsRemaining: 9,
};
const events: EbaySearchEvent[] = [
  { type: "started", credits },
  { type: "result", side: "active", data: { items: [{ title: "Flabébé" }] } },
  { type: "result", side: "sold", data: { items: [] } },
  { type: "complete", credits },
];

function streamed(text: string, byteByByte = false) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        if (byteByByte)
          for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        else controller.enqueue(bytes);
        controller.close();
      },
    }),
  );
}

test.each([false, true])(
  "decodes combined and split UTF-8 events (byte chunks: %s)",
  async (byteByByte) => {
    const received: EbaySearchEvent[] = [];
    await readEbaySearchStream(
      streamed(
        events.map((event) => JSON.stringify(event)).join("\n"),
        byteByByte,
      ),
      (event) => received.push(event),
    );
    expect(received).toEqual(events);
  },
);

test.each([
  [events[0], events[1]],
  [events[0], events[1], events[1], events[3]],
  [events[0], events[3]],
  [events[0], { type: "result", side: "sold", data: {} }],
  [events[0], { type: "error", message: "Search failed" }],
])(
  "rejects interrupted, duplicate, incomplete, and malformed streams",
  async (...input) => {
    await expect(
      readEbaySearchStream(
        streamed(input.map((event) => JSON.stringify(event)).join("\n")),
        () => undefined,
      ),
    ).rejects.toThrow();
  },
);

test("preserves a received result when the stream subsequently breaks", async () => {
  const received: EbaySearchEvent[] = [];
  await expect(
    readEbaySearchStream(
      streamed(
        `${JSON.stringify(events[0])}\n${JSON.stringify(events[1])}\nnot-json\n`,
      ),
      (event) => received.push(event),
    ),
  ).rejects.toThrow();
  expect(received).toEqual(events.slice(0, 2));
});
