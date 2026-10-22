import { useEffect, useState } from "react";

const RESEARCHING_MESSAGE = "Still comparing sources. This can take a minute.";

export function GrokLoadingState({ children }: { children: string }) {
  const [isResearching, setIsResearching] = useState(false);

  useEffect(() => {
    const delayMs = 5_000 + Math.floor(Math.random() * 5_001);
    const timeout = window.setTimeout(() => setIsResearching(true), delayMs);
    return () => window.clearTimeout(timeout);
  }, []);

  return isResearching ? RESEARCHING_MESSAGE : children;
}
