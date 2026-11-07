import { afterEach, expect, test, vi } from "vitest";
import { getDemoPortfolio } from "./portfolioApi";
import { savedListRequest } from "./savedListApi";

vi.mock("./savedListApi", () => ({ savedListRequest: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

test.each(["collection", "watchlist"] as const)(
  "loads the public demo %s without authenticated portfolio access",
  async (list) => {
    const payload = { entries: [], items: [], missingItems: [] };
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal("fetch", fetchMock);
    expect(await getDemoPortfolio(list)).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3001/api/portfolio/demo?list=${list}`,
      { signal: expect.any(AbortSignal) },
    );
    expect(savedListRequest).not.toHaveBeenCalled();
  },
);

test("reports failed demo requests rather than rendering an empty portfolio", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  await expect(getDemoPortfolio("collection")).rejects.toThrow(
    "Failed to load demo portfolio",
  );
});
