import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./authContextValue";
import { PortfolioContext } from "./portfolioCacheContextValue";
import { getPortfolioReferences } from "../services/portfolioApi";
import type { PortfolioReference } from "../types/portfolio";
import { logClientError } from "../utils/logClientError";

type PortfolioReferenceState = {
  uid: string | null;
  references: Map<string, PortfolioReference>;
};

const EMPTY_PORTFOLIO_REFERENCES: ReadonlyMap<string, PortfolioReference> =
  new Map();

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { user: authUser } = useAuth();
  const authUid = authUser?.uid ?? null;
  const activeUidRef = useRef(authUid);
  const activeRequestRef = useRef(0);
  const dataRevisionRef = useRef(0);
  const successfullyLoadedUidRef = useRef<string | null>(null);
  const [portfolioState, setPortfolioState] =
    useState<PortfolioReferenceState>({
      uid: null,
      references: new Map(),
    });
  const [refreshingPortfolioReferences, setRefreshingPortfolioReferences] =
    useState(false);
  const [portfolioReferencesError, setPortfolioReferencesError] =
    useState<string | null>(null);

  const portfolioReferences =
    portfolioState.uid === authUid
      ? portfolioState.references
      : EMPTY_PORTFOLIO_REFERENCES;
  const loadingPortfolioReferences =
    Boolean(authUid) &&
    (portfolioState.uid !== authUid || refreshingPortfolioReferences);

  const replacePortfolioReferences = useCallback(
    (entries: PortfolioReference[]) => {
      if (!authUid || activeUidRef.current !== authUid) return;

      dataRevisionRef.current += 1;
      successfullyLoadedUidRef.current = authUid;
      setPortfolioReferencesError(null);
      setPortfolioState({
        uid: authUid,
        references: new Map(
          entries.map((entry) => [entry.cardId, entry]),
        ),
      });
    },
    [authUid],
  );

  const refreshPortfolioReferences = useCallback(async () => {
    const requestId = ++activeRequestRef.current;
    const startingRevision = dataRevisionRef.current;
    const requestedUid = authUid;

    if (!requestedUid) {
      dataRevisionRef.current += 1;
      successfullyLoadedUidRef.current = null;
      setPortfolioReferencesError(null);
      setPortfolioState({ uid: null, references: new Map() });
      setRefreshingPortfolioReferences(false);
      return;
    }

    try {
      setRefreshingPortfolioReferences(true);
      setPortfolioReferencesError(null);
      const { entries } = await getPortfolioReferences(requestedUid);
      if (
        requestId !== activeRequestRef.current ||
        startingRevision !== dataRevisionRef.current ||
        activeUidRef.current !== requestedUid
      ) return;
      replacePortfolioReferences(entries);
    } catch (error) {
      if (
        requestId !== activeRequestRef.current ||
        startingRevision !== dataRevisionRef.current ||
        activeUidRef.current !== requestedUid
      ) return;
      logClientError("Failed to refresh portfolio", error);
      setPortfolioReferencesError(
        error instanceof Error
          ? error.message
          : "Portfolio references could not be loaded",
      );
      setPortfolioState((current) =>
        current.uid === requestedUid
          ? current
          : { uid: requestedUid, references: new Map() },
      );
    } finally {
      if (
        requestId === activeRequestRef.current &&
        activeUidRef.current === requestedUid
      ) {
        setRefreshingPortfolioReferences(false);
      }
    }
  }, [authUid, replacePortfolioReferences]);

  const upsertPortfolioReference = useCallback((entry: PortfolioReference) => {
    if (!authUid || activeUidRef.current !== authUid) return;

    const needsFullRefresh = successfullyLoadedUidRef.current !== authUid;
    dataRevisionRef.current += 1;
    setPortfolioState((current) => {
      const next = new Map(
        current.uid === authUid ? current.references : undefined,
      );
      next.set(entry.cardId, entry);
      return { uid: authUid, references: next };
    });
    if (needsFullRefresh) void refreshPortfolioReferences();
  }, [authUid, refreshPortfolioReferences]);

  const removePortfolioReference = useCallback((cardId: string) => {
    if (!authUid || activeUidRef.current !== authUid) return;

    const needsFullRefresh = successfullyLoadedUidRef.current !== authUid;
    dataRevisionRef.current += 1;
    setPortfolioState((current) => {
      const next = new Map(
        current.uid === authUid ? current.references : undefined,
      );
      next.delete(cardId);
      return { uid: authUid, references: next };
    });
    if (needsFullRefresh) void refreshPortfolioReferences();
  }, [authUid, refreshPortfolioReferences]);

  const isCardSaved = useCallback(
    (cardId: string) => portfolioReferences.has(cardId),
    [portfolioReferences],
  );

  useLayoutEffect(() => {
    activeUidRef.current = authUid;
  }, [authUid]);

  useEffect(() => {
    const initialize = window.setTimeout(() => {
      void refreshPortfolioReferences();
    }, 0);

    return () => {
      window.clearTimeout(initialize);
      activeRequestRef.current += 1;
    };
  }, [refreshPortfolioReferences]);

  return (
    <PortfolioContext.Provider
      value={{
        portfolioReferences,
        portfolioReferencesError,
        loadingPortfolioReferences,
        refreshPortfolioReferences,
        replacePortfolioReferences,
        upsertPortfolioReference,
        removePortfolioReference,
        isCardSaved,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}
