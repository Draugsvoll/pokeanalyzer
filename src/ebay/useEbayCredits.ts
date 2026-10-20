import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import type { EbayCredits } from "../../shared/ebayCredits";
import { useAuth } from "../context/authContextValue";
import {
  EBAY_CREDITS_REFRESH_EVENT,
  fetchEbayCredits,
  parseEbayCredits,
} from "./ebayCreditsApi";

function useAccountEbayCredits(user: User | null) {
  const uid = user?.uid;
  const verified = user?.emailVerified ?? false;
  const [account, setAccount] = useState({ uid, verified });
  const [credits, setCredits] = useState<EbayCredits | null>(null);
  const [loading, setLoading] = useState(Boolean(user?.emailVerified));
  const [error, setError] = useState("");
  const currentCredits = useRef<EbayCredits | null>(null);
  const request = useRef<AbortController | null>(null);
  const activeAccount = useRef<typeof account | null>(null);
  const [returnedFromBilling] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get("checkout") === "success" || params.get("portal") === "return"
    );
  });
  // Reset before rendering children, without remounting their forms or dialogs.
  if (account.uid !== uid || account.verified !== verified) {
    setAccount({ uid, verified });
    setCredits(null);
    setLoading(Boolean(uid && verified));
    setError("");
  }

  const updateCredits = useCallback((value: EbayCredits) => {
    if (activeAccount.current !== account) return;
    const next = parseEbayCredits(value);
    if (
      currentCredits.current &&
      next.version < currentCredits.current.version
    ) {
      return;
    }
    currentCredits.current = next;
    setCredits(next);
    setError("");
    setLoading(false);
  }, [account]);

  const refreshCredits = useCallback(async () => {
    if (!uid || !verified || activeAccount.current !== account) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    if (!currentCredits.current) setLoading(true);
    setError("");
    try {
      const next = await fetchEbayCredits(
        uid,
        AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      );
      if (!controller.signal.aborted && activeAccount.current === account) {
        updateCredits(next);
      }
    } catch {
      if (!controller.signal.aborted && activeAccount.current === account) {
        setError("We couldn’t load your eBay credits. Please try again.");
      }
    } finally {
      if (!controller.signal.aborted && activeAccount.current === account) {
        setLoading(false);
      }
    }
  }, [uid, verified, account, updateCredits]);

  useLayoutEffect(() => {
    activeAccount.current = account;
    currentCredits.current = null;
    return () => {
      activeAccount.current = null;
      request.current?.abort();
    };
  }, [account]);

  useEffect(() => {
    void refreshCredits();
    const refresh = () => void refreshCredits();
    window.addEventListener(EBAY_CREDITS_REFRESH_EVENT, refresh);
    window.addEventListener("focus", refresh);
    const timers = returnedFromBilling
      ? [1200, 3500, 7000].map((delay) => window.setTimeout(refresh, delay))
      : [];
    return () => {
      request.current?.abort();
      timers.forEach(window.clearTimeout);
      window.removeEventListener(EBAY_CREDITS_REFRESH_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [account, refreshCredits, returnedFromBilling]);

  return { credits, loading, error, refreshCredits, updateCredits };
}

const EbayCreditsContext = createContext<
  ReturnType<typeof useAccountEbayCredits> | undefined
>(undefined);

export function EbayCreditsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const value = useAccountEbayCredits(user);
  return createElement(EbayCreditsContext.Provider, { value }, children);
}

export function useEbayCredits() {
  const value = useContext(EbayCreditsContext);
  if (!value) throw new Error("useEbayCredits requires EbayCreditsProvider");
  return value;
}
