import { useCallback, useEffect, useRef } from "react";

const VISIBLE_CLASS = "ui-scroll-reveal--visible";

export function useScrollReveal<T extends HTMLElement>() {
  const observerRef = useRef<IntersectionObserver | null>(null);

  const revealRef = useCallback((element: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (!element) return;

    const view = element.ownerDocument.defaultView;
    if (
      !view ||
      !("IntersectionObserver" in view) ||
      view.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      element.classList.add(VISIBLE_CLASS);
      return;
    }

    const observer = new view.IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        element.classList.add(VISIBLE_CLASS);
        observer.unobserve(element);
      },
      {
        rootMargin: "0px 0px 6% 0px",
        threshold: 0.08,
      },
    );

    observer.observe(element);
    observerRef.current = observer;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return revealRef;
}
