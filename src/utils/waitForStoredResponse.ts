export function waitForStoredResponse(signal: AbortSignal) {
  const delayMs = 1000 + Math.random() * 3000;

  return new Promise<void>((resolve, reject) => {
    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("The request was aborted", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);

    if (signal.aborted) {
      handleAbort();
      return;
    }
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}
