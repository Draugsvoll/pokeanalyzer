import { afterEach, expect, test, vi } from "vitest";
import { fetchCardById } from "./cardApi";

afterEach(() => vi.unstubAllGlobals());

test("loads a card from the active card API", async () => {
  const fixture = { id: "card-123", name: "Charizard" };
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => fixture,
    ok: true,
  });
  vi.stubGlobal("fetch", fetchMock);

  const card = await fetchCardById("card-123");

  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/cards/card-123",
    expect.objectContaining({ cache: "no-store" }),
  );
  expect(card.id).toBe("card-123");
  expect(card.name).toBe("Charizard");
});

test("loads the static demo without calling the card API", async () => {
  const fixture = { id: "demo", name: "Charizard" };
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => fixture,
    ok: true,
  });
  vi.stubGlobal("fetch", fetchMock);

  const card = await fetchCardById("demo");

  expect(fetchMock).toHaveBeenCalledWith(
    "/demo-card.json",
    expect.objectContaining({ cache: "no-store" }),
  );
  expect(card.id).toBe("demo");
});
