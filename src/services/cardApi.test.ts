import { afterEach, expect, test, vi } from "vitest";
import { fetchCardById } from "./cardApi";

afterEach(() => vi.unstubAllGlobals());

test("demo card uses the static snapshot URL", async () => {
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
  expect(card.name).toBe("Charizard");
});
