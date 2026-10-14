// Keep a category's single loading indicator visible while its images load.
// Failed or stalled images must not prevent the category from being usable.
export function waitForCardImages(urls: string[], signal: AbortSignal) {
  return Promise.all(
    [...new Set(urls.filter(Boolean))].map(
      (url) =>
        new Promise<void>((resolve) => {
          if (signal.aborted) return resolve();
          const image = new Image();
          const finish = () => {
            clearTimeout(timeout);
            image.onload = null;
            image.onerror = null;
            signal.removeEventListener("abort", finish);
            resolve();
          };
          const timeout = setTimeout(finish, 10_000);
          image.onload = finish;
          image.onerror = finish;
          signal.addEventListener("abort", finish, { once: true });
          image.src = url;
          if (image.complete) finish();
        }),
    ),
  );
}
