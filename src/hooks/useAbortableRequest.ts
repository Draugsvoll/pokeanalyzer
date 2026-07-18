import { useCallback, useEffect, useRef } from "react";

export function useAbortableRequest() {
  const controllerRef = useRef<AbortController | null>(null);

  const abortActiveRequest = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const startRequest = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return controller.signal;
  }, []);

  const isCurrentRequest = useCallback(
    (signal: AbortSignal) => controllerRef.current?.signal === signal,
    [],
  );

  useEffect(() => abortActiveRequest, [abortActiveRequest]);

  return { abortActiveRequest, isCurrentRequest, startRequest };
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
