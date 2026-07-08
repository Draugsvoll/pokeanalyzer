import { useMemo } from "react";

export function useInitials(value?: string | null, fallback = "?") {
  return useMemo(() => {
    return value?.trim().charAt(0).toUpperCase() || fallback;
  }, [fallback, value]);
}
