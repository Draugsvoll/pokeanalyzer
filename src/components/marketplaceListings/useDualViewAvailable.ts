import { useEffect, useState } from "react";

const DUAL_VIEW_BREAKPOINT = "(min-width: 1100px)";

export function useDualViewAvailable() {
  const [available, setAvailable] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(DUAL_VIEW_BREAKPOINT).matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia(DUAL_VIEW_BREAKPOINT);
    const updateAvailability = () => setAvailable(mediaQuery.matches);

    updateAvailability();
    mediaQuery.addEventListener("change", updateAvailability);
    return () => mediaQuery.removeEventListener("change", updateAvailability);
  }, []);

  return available;
}
