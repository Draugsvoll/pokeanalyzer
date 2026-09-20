import { useEffect, useState } from "react";
import { LoadingState } from "../../../components/loadingState/LoadingState";
import "./GrokLoadingState.scss";

const RESEARCHING_MESSAGE = "Comparing sources, this might take a minute...";

export function GrokLoadingState({ children }: { children: string }) {
  const [isResearching, setIsResearching] = useState(false);

  useEffect(() => {
    const delayMs = 5_000 + Math.floor(Math.random() * 5_001);
    const timeout = window.setTimeout(() => setIsResearching(true), delayMs);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <LoadingState className="grok-loading-state">
      {isResearching ? RESEARCHING_MESSAGE : children}
    </LoadingState>
  );
}
