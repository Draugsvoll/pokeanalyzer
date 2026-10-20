import { isEbayListings, type EbaySearchEvent } from "../../shared/ebaySearch";
import { parseEbayCredits } from "./ebayCreditsApi";

function parseEvent(value: unknown): EbaySearchEvent {
  if (!value || typeof value !== "object" || !("type" in value)) {
    throw new Error("Invalid eBay search event");
  }
  const event = value as Record<string, unknown>;
  if (event.type === "started" || event.type === "complete") {
    return { type: event.type, credits: parseEbayCredits(event.credits) };
  }
  if (event.type === "error" && typeof event.message === "string") {
    return { type: "error", message: event.message };
  }
  if (event.side === "sold" || event.side === "active") {
    if (event.type === "result" && isEbayListings(event.data)) {
      return { type: "result", side: event.side, data: event.data };
    }
    if (event.type === "failure" && typeof event.message === "string") {
      return { type: "failure", side: event.side, message: event.message };
    }
  }
  throw new Error("Invalid eBay search event");
}

export async function readEbaySearchStream(
  response: Response,
  onEvent: (event: EbaySearchEvent) => void,
) {
  if (!response.body) throw new Error("Missing eBay response stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const settled = new Set<string>();
  let buffered = "";
  let started = false;
  let complete = false;

  function consume(line: string) {
    if (!line.trim()) return;
    const event = parseEvent(JSON.parse(line));
    if (complete) throw new Error("Unexpected eBay event after completion");
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "started") {
      if (started || settled.size > 0) throw new Error("Duplicate eBay search");
      started = true;
    } else if (event.type === "result" || event.type === "failure") {
      if (!started || settled.has(event.side))
        throw new Error("Unexpected eBay result");
      settled.add(event.side);
    } else {
      if (settled.size !== 2) throw new Error("Incomplete eBay search");
      complete = true;
    }
    onEvent(event);
  }

  try {
    while (!complete) {
      const { done, value } = await reader.read();
      buffered += decoder.decode(value, { stream: !done });
      if (buffered.length > 5_000_000)
        throw new Error("eBay response too large");
      let newline: number;
      while ((newline = buffered.indexOf("\n")) !== -1) {
        consume(buffered.slice(0, newline));
        buffered = buffered.slice(newline + 1);
      }
      if (done) {
        if (buffered.trim()) consume(buffered);
        if (!complete) throw new Error("eBay search connection ended early");
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
