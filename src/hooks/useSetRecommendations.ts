import { useEffect, useState } from "react";

type SetLoader<T> = (setName: string, signal: AbortSignal) => Promise<T[]>;

/** Optional details-page recommendations: omit failures and ignore stale requests. */
export function useSetRecommendations<T>(setName: string, load: SetLoader<T>) {
  const [result, setResult] = useState<{
    setName: string;
    items: T[];
  } | null>(null);

  useEffect(() => {
    if (!setName) return;
    const controller = new AbortController();

    async function request() {
      try {
        const items = await load(setName, controller.signal);
        if (!controller.signal.aborted) setResult({ setName, items });
      } catch {
        // Recommendations must not interrupt the primary details page.
        if (!controller.signal.aborted) setResult(null);
      }
    }

    void request();
    return () => controller.abort();
  }, [load, setName]);

  return result?.setName === setName ? result.items : null;
}
