import { useEffect, useState } from "react";

export function useMarketplaceRateLimit() {
  const [rateLimited, setRateLimited] = useState(false);
  useEffect(() => {
    if (!rateLimited) return;
    const timer = window.setTimeout(() => setRateLimited(false), 15_000);
    return () => window.clearTimeout(timer);
  }, [rateLimited]);
  return [rateLimited, setRateLimited] as const;
}
