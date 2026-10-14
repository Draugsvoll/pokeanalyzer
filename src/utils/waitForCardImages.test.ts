import { afterEach, expect, test, vi } from "vitest";
import { waitForCardImages } from "./waitForCardImages";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mockImages() {
  const images: Array<{
    onload: (() => void) | null;
    onerror: (() => void) | null;
  }> = [];
  vi.stubGlobal(
    "Image",
    class {
      complete = false;
      src = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        images.push(this);
      }
    },
  );
  return images;
}

test("keeps the category waiting until every image has loaded or failed", async () => {
  const images = mockImages();
  const ready = vi.fn();
  const pending = waitForCardImages(
    ["a.webp", "b.webp", "a.webp", ""],
    new AbortController().signal,
  ).then(ready);
  expect(images).toHaveLength(2);
  images[0].onload?.();
  await Promise.resolve();
  expect(ready).not.toHaveBeenCalled();
  images[1].onerror?.();
  await pending;
  expect(ready).toHaveBeenCalledOnce();
});

test("releases stalled images after the timeout and cleans up on navigation", async () => {
  vi.useFakeTimers();
  const images = mockImages();
  const controller = new AbortController();
  const aborted = waitForCardImages(["a.webp"], controller.signal);
  controller.abort();
  await aborted;
  expect(images[0].onload).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  const stalled = waitForCardImages(["b.webp"], new AbortController().signal);
  await vi.advanceTimersByTimeAsync(10_000);
  await stalled;
  expect(images[1].onload).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
