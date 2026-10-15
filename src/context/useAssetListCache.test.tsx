import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { PortfolioReference, PortfolioSingle } from "../types/portfolio";
import type { WatchlistReference } from "../types/watchlist";
import { useAssetListCache } from "./useAssetListCache";

const auth = vi.hoisted(() => ({
  user: { uid: "alice" } as { uid: string } | null,
}));
vi.mock("./authContextValue", () => ({ useAuth: () => auth }));
beforeEach(() => {
  auth.user = { uid: "alice" };
});

test("a late account response and old mutation callback cannot populate the next user's cache", async () => {
  let finishAlice!: (result: { entries: WatchlistReference[] }) => void;
  const fetch = vi.fn((uid: string) =>
    uid === "alice"
      ? new Promise<{ entries: WatchlistReference[] }>((resolve) => {
          finishAlice = resolve;
        })
      : Promise.resolve({
          entries: [{ id: "bob-card", type: "single" as const }],
        }),
  );
  const { result, rerender } = renderHook(() => useAssetListCache(fetch));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("alice"));
  const oldUpsert = result.current.upsertReference;
  auth.user = { uid: "bob" };
  rerender();
  await waitFor(() =>
    expect(result.current.isItemSaved("single", "bob-card")).toBe(true),
  );
  await act(async () => {
    finishAlice({ entries: [{ id: "alice-card", type: "single" }] });
    oldUpsert({ id: "alice-late-save", type: "single" });
  });
  expect([...result.current.references.keys()]).toEqual(["single:bob-card"]);
  auth.user = null;
  rerender();
  expect(result.current.references.size).toBe(0);
});

test("a stale refresh cannot undo a successful local save", async () => {
  let finishRefresh!: (result: { entries: WatchlistReference[] }) => void;
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ entries: [] })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        }),
    );
  const { result } = renderHook(() =>
    useAssetListCache<WatchlistReference>(fetch),
  );
  await waitFor(() => expect(result.current.loadingReferences).toBe(false));
  act(() => {
    void result.current.refreshReferences();
  });
  act(() => {
    result.current.upsertReference({ id: "saved", type: "sealed" });
  });
  await act(async () => {
    finishRefresh({ entries: [] });
  });
  expect(result.current.isItemSaved("sealed", "saved")).toBe(true);
});

function savedCard(quantity: number): PortfolioSingle {
  return {
    id: "card-1",
    type: "single",
    quantity,
    name: "Pikachu",
    set: { id: "base", name: "Base" },
    pokeTrace: { currency: "USD", prices: {}, marketplaceUrls: {} },
  };
}

test("mutation guards release on errors and isolate account, asset type, and list", async () => {
  const fetch = vi.fn().mockResolvedValue({ entries: [] });
  const { result, rerender } = renderHook(() => ({
    collection: useAssetListCache(fetch),
    watchlist: useAssetListCache(fetch),
  }));
  await waitFor(() =>
    expect(result.current.collection.loadingReferences).toBe(false),
  );
  let reject!: (error: Error) => void;
  let first!: Promise<boolean>;
  act(() => {
    first = result.current.collection.runMutation(
      "single",
      "same-id",
      () =>
        new Promise<boolean>((_resolve, fail) => {
          reject = fail;
        }),
    );
  });
  const competing = vi.fn(async () => true);
  await act(async () => {
    expect(
      await result.current.collection.runMutation(
        "single",
        "same-id",
        competing,
      ),
    ).toBe(false);
    expect(
      await result.current.collection.runMutation(
        "sealed",
        "same-id",
        competing,
      ),
    ).toBe(true);
    expect(
      await result.current.collection.runMutation(
        "single",
        "another-id",
        competing,
      ),
    ).toBe(true);
    expect(
      await result.current.watchlist.runMutation(
        "single",
        "same-id",
        competing,
      ),
    ).toBe(true);
  });
  expect(competing).toHaveBeenCalledTimes(3);
  const oldRun = result.current.collection.runMutation;
  auth.user = { uid: "bob" };
  rerender();
  expect(result.current.collection.isItemUpdating("single", "same-id")).toBe(
    false,
  );
  let finishBob!: (value: boolean) => void;
  let bob!: Promise<boolean>;
  act(() => {
    bob = result.current.collection.runMutation(
      "single",
      "same-id",
      () =>
        new Promise<boolean>((resolve) => {
          finishBob = resolve;
        }),
    );
  });
  await act(async () => {
    expect(await oldRun("single", "new-id", competing)).toBe(false);
    const failed = expect(first).rejects.toThrow("Offline");
    reject(new Error("Offline"));
    await failed;
  });
  expect(result.current.collection.isItemUpdating("single", "same-id")).toBe(
    true,
  );
  await act(async () => {
    finishBob(true);
    await bob;
  });
  expect(result.current.collection.isItemUpdating("single", "same-id")).toBe(
    false,
  );
  auth.user = { uid: "alice" };
  rerender();
  await act(async () => {
    expect(
      await result.current.collection.runMutation(
        "single",
        "same-id",
        competing,
      ),
    ).toBe(true);
  });
});

for (const edit of ["quantity", "remove", "add"] as const) {
  test(`hydration cannot overwrite a confirmed ${edit} while loading`, async () => {
    const original = savedCard(2);
    const fetchReferences = vi.fn().mockResolvedValue({ entries: [original] });
    const { result } = renderHook(() =>
      useAssetListCache<PortfolioReference>(fetchReferences),
    );
    await waitFor(() => expect(result.current.loadingReferences).toBe(false));
    act(() => result.current.replaceReferences([original], [original]));
    type Snapshot = { entries: PortfolioReference[]; items: PortfolioSingle[] };
    let finishOld!: (value: Snapshot) => void;
    let finishFresh!: (value: Snapshot) => void;
    const fetchItems = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Snapshot>((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Snapshot>((resolve) => {
            finishFresh = resolve;
          }),
      );
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.hydrate(
        fetchItems,
        new AbortController().signal,
      );
    });
    const confirmed =
      edit === "quantity" ? savedCard(5) : { ...savedCard(1), id: "new-card" };
    act(() => {
      if (edit === "remove")
        result.current.removeReference("single", original.id);
      else result.current.upsertReference(confirmed, confirmed);
    });
    const expected =
      edit === "remove"
        ? []
        : edit === "quantity"
          ? [confirmed]
          : [original, confirmed];
    await act(async () => {
      finishOld({ entries: [original], items: [original] });
    });
    expect(result.current.items).toEqual(expected);
    expect([...result.current.references.keys()]).toEqual(
      expected.map((item) => `single:${item.id}`),
    );
    expect(fetchItems).toHaveBeenCalledTimes(2);
    await act(async () => {
      finishFresh({ entries: expected, items: expected });
      await pending;
    });
    expect(result.current.items).toEqual(expected);
    expect(fetchReferences).toHaveBeenCalledTimes(1);
  });
}

test("an aborted hydration cannot replace confirmed items or membership", async () => {
  const original = savedCard(2);
  const fetchReferences = vi.fn().mockResolvedValue({ entries: [original] });
  const { result } = renderHook(() =>
    useAssetListCache<PortfolioReference>(fetchReferences),
  );
  await waitFor(() => expect(result.current.loadingReferences).toBe(false));
  act(() => result.current.replaceReferences([original], [original]));
  let finish!: (value: {
    entries: PortfolioReference[];
    items: PortfolioSingle[];
  }) => void;
  const fetchItems = vi.fn(
    () =>
      new Promise<{ entries: PortfolioReference[]; items: PortfolioSingle[] }>(
        (resolve) => {
          finish = resolve;
        },
      ),
  );
  const controller = new AbortController();
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.hydrate(fetchItems, controller.signal);
  });
  controller.abort();
  await act(async () => {
    finish({ entries: [], items: [] });
    await pending;
  });
  expect(result.current.items).toEqual([original]);
  expect(result.current.isItemSaved("single", original.id)).toBe(true);
  expect(fetchItems).toHaveBeenCalledTimes(1);
});
