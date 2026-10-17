import { expect, test, vi } from "vitest";
import { authenticatedFetch } from "../authenticatedFetch";
import { askGrok } from "./grokClient";

vi.mock("../authenticatedFetch", () => ({ authenticatedFetch: vi.fn() }));

test.each([409, 429, 502])(
  "preserves HTTP %s for analysis error handling",
  async (status) => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Request rejected" }), { status }),
    );

    expect(await askGrok("worth_grading", { cardId: "card-a" })).toMatchObject({
      ok: false,
      status,
    });
  },
);
