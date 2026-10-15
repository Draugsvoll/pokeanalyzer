import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./authContextValue";
import type { WatchlistReference } from "../types/watchlist";
import type { PortfolioItem } from "../types/portfolio";
import { logClientError } from "../utils/logClientError";

type ReferenceState<T> = {
  uid: string | null;
  references: Map<string, T>;
  details: Map<string, PortfolioItem>;
};

const EMPTY_REFERENCES: ReadonlyMap<string, never> = new Map<string, never>();

export function useAssetListCache<T extends WatchlistReference>(
  fetchReferences: (uid: string) => Promise<{ entries: T[] }>,
) {
  const { user: authUser } = useAuth();
  const authUid = authUser?.uid ?? null;
  const activeUidRef = useRef(authUid);
  const activeRequestRef = useRef(0);
  const dataRevisionRef = useRef(0);
  const mutationRevisionRef = useRef(0);
  const successfullyLoadedUidRef = useRef<string | null>(null);
  const pendingMutationsRef = useRef(new Set<string>());
  const [pendingMutations, setPendingMutations] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [listState, setListState] = useState<ReferenceState<T>>({
    uid: null,
    references: new Map(),
    details: new Map(),
  });
  const [refreshingReferences, setRefreshingReferences] = useState(false);
  const [referencesError, setReferencesError] = useState<string | null>(null);

  const references =
    listState.uid === authUid ? listState.references : EMPTY_REFERENCES;
  const loadingReferences =
    Boolean(authUid) && (listState.uid !== authUid || refreshingReferences);

  const runMutation = useCallback(
    async (type: T["type"], id: string, operation: () => Promise<boolean>) => {
      if (!authUid || activeUidRef.current !== authUid) return false;
      const key = JSON.stringify([authUid, type, id]);
      if (pendingMutationsRef.current.has(key)) return false;

      // Acquire synchronously so another component cannot start a competing write.
      pendingMutationsRef.current.add(key);
      setPendingMutations(new Set(pendingMutationsRef.current));
      try {
        return await operation();
      } finally {
        pendingMutationsRef.current.delete(key);
        setPendingMutations(new Set(pendingMutationsRef.current));
      }
    },
    [authUid],
  );

  const isItemUpdating = useCallback(
    (type: T["type"], id: string) =>
      pendingMutations.has(JSON.stringify([authUid, type, id])),
    [authUid, pendingMutations],
  );

  const replaceReferences = useCallback(
    (entries: T[], items?: PortfolioItem[]) => {
      if (!authUid || activeUidRef.current !== authUid) return;

      dataRevisionRef.current += 1;
      successfullyLoadedUidRef.current = authUid;
      setReferencesError(null);
      setListState((current) => ({
        uid: authUid,
        references: new Map(
          entries.map((entry) => [`${entry.type}:${entry.id}`, entry]),
        ),
        details: items
          ? new Map(items.map((item) => [`${item.type}:${item.id}`, item]))
          : current.uid === authUid
            ? current.details
            : new Map(),
      }));
    },
    [authUid],
  );

  const refreshReferences = useCallback(async () => {
    if (activeUidRef.current !== authUid) return;
    const requestId = ++activeRequestRef.current;
    const startingRevision = dataRevisionRef.current;
    const requestedUid = authUid;

    if (!requestedUid) {
      dataRevisionRef.current += 1;
      successfullyLoadedUidRef.current = null;
      setReferencesError(null);
      setListState({ uid: null, references: new Map(), details: new Map() });
      setRefreshingReferences(false);
      return;
    }

    try {
      setRefreshingReferences(true);
      setReferencesError(null);
      const { entries } = await fetchReferences(requestedUid);
      if (
        requestId !== activeRequestRef.current ||
        startingRevision !== dataRevisionRef.current ||
        activeUidRef.current !== requestedUid
      )
        return;
      replaceReferences(entries);
    } catch (error) {
      if (
        requestId !== activeRequestRef.current ||
        startingRevision !== dataRevisionRef.current ||
        activeUidRef.current !== requestedUid
      )
        return;
      logClientError("Failed to refresh saved items", error);
      setReferencesError(
        "We couldn’t load your saved items. Please try again.",
      );
      setListState((current) =>
        current.uid === requestedUid
          ? current
          : { uid: requestedUid, references: new Map(), details: new Map() },
      );
    } finally {
      if (
        requestId === activeRequestRef.current &&
        activeUidRef.current === requestedUid
      ) {
        setRefreshingReferences(false);
      }
    }
  }, [authUid, replaceReferences, fetchReferences]);

  const upsertReference = useCallback(
    (entry: T, item?: PortfolioItem) => {
      if (!authUid || activeUidRef.current !== authUid) return false;

      const needsFullRefresh = successfullyLoadedUidRef.current !== authUid;
      dataRevisionRef.current += 1;
      mutationRevisionRef.current += 1;
      setListState((current) => {
        const next = new Map(
          current.uid === authUid ? current.references : undefined,
        );
        const key = `${entry.type}:${entry.id}`;
        next.set(key, entry);
        const details = new Map(
          current.uid === authUid ? current.details : undefined,
        );
        // Keep the complete hydrated data when the item is already known.
        if (item && !details.has(key)) details.set(key, item);
        return { uid: authUid, references: next, details };
      });
      if (needsFullRefresh) void refreshReferences();
      return true;
    },
    [authUid, refreshReferences],
  );

  const removeReference = useCallback(
    (type: T["type"], id: string) => {
      if (!authUid || activeUidRef.current !== authUid) return false;

      const needsFullRefresh = successfullyLoadedUidRef.current !== authUid;
      dataRevisionRef.current += 1;
      mutationRevisionRef.current += 1;
      setListState((current) => {
        const next = new Map(
          current.uid === authUid ? current.references : undefined,
        );
        const key = `${type}:${id}`;
        next.delete(key);
        const details = new Map(
          current.uid === authUid ? current.details : undefined,
        );
        details.delete(key);
        return { uid: authUid, references: next, details };
      });
      if (needsFullRefresh) void refreshReferences();
      return true;
    },
    [authUid, refreshReferences],
  );

  const hydrate = useCallback(
    async (
      fetchItems: (
        uid: string,
        signal: AbortSignal,
      ) => Promise<{ entries: T[]; items: PortfolioItem[] }>,
      signal: AbortSignal,
    ) => {
      while (!signal.aborted && authUid && activeUidRef.current === authUid) {
        const revision = mutationRevisionRef.current;
        const response = await fetchItems(authUid, signal);
        if (signal.aborted || activeUidRef.current !== authUid) return;
        // A confirmed edit wins over a snapshot requested before that edit.
        // Retry this initial/recovery load so it still includes all other assets.
        if (revision !== mutationRevisionRef.current) continue;
        replaceReferences(response.entries, response.items);
        return;
      }
    },
    [authUid, replaceReferences],
  );

  const { items, missingItems } = useMemo(() => {
    const items: PortfolioItem[] = [];
    const missingItems: T[] = [];
    for (const [key, entry] of references) {
      const item = listState.details.get(key);
      if (item) {
        items.push({
          ...item,
          quantity:
            "quantity" in entry && typeof entry.quantity === "number"
              ? entry.quantity
              : 1,
        });
      } else {
        missingItems.push(entry);
      }
    }
    return { items, missingItems };
  }, [references, listState.details]);

  const isItemSaved = useCallback(
    (type: T["type"], id: string) => references.has(`${type}:${id}`),
    [references],
  );
  const isCardSaved = useCallback(
    (cardId: string) => isItemSaved("single", cardId),
    [isItemSaved],
  );

  useLayoutEffect(() => {
    activeUidRef.current = authUid;
    successfullyLoadedUidRef.current = null;
  }, [authUid]);

  useEffect(() => {
    const initialize = window.setTimeout(() => {
      if (successfullyLoadedUidRef.current !== authUid)
        void refreshReferences();
    }, 0);

    return () => {
      window.clearTimeout(initialize);
      activeRequestRef.current += 1;
    };
  }, [authUid, refreshReferences]);

  return {
    runMutation,
    isItemUpdating,
    items,
    missingItems,
    hydrate,
    references,
    referencesError,
    loadingReferences,
    refreshReferences,
    replaceReferences,
    upsertReference,
    removeReference,
    isItemSaved,
    isCardSaved,
  };
}
