import { useEffect } from "react";

/** Stops the mouse wheel from changing a focused number input. */
export function useBlockNumberInputWheel() {
  useEffect(() => {
    const blockWheel = (event: WheelEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== "number") return;
      if (document.activeElement !== target) return;
      event.preventDefault();
    };

    document.addEventListener("wheel", blockWheel, { passive: false });
    return () => document.removeEventListener("wheel", blockWheel);
  }, []);
}
