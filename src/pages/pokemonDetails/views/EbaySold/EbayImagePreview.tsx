import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function EbayImagePreview({
  src,
  previewSrc,
  title,
}: {
  src: string;
  previewSrc?: string;
  title: string;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [imageState, setImageState] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  function cancelClose() {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function cancelOpen() {
    if (openTimer.current !== null) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }

  function closeSoon() {
    cancelOpen();
    cancelClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setPosition(null);
    }, 150);
  }

  function open() {
    cancelOpen();
    cancelClose();
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    if (!position) setImageState("loading");
    const gap = 12;
    const width = Math.min(360, window.innerWidth - gap * 2);
    const height = Math.min(480, window.innerHeight - gap * 2);
    const left =
      rect.right + gap + width <= window.innerWidth - gap
        ? rect.right + gap
        : rect.left - gap - width;
    setPosition({
      left: Math.max(gap, Math.min(left, window.innerWidth - width - gap)),
      top: Math.max(gap, Math.min(rect.top, window.innerHeight - height - gap)),
      width,
      height,
    });
  }

  function openSoon() {
    cancelClose();
    cancelOpen();
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      open();
    }, 250);
  }

  useEffect(
    () => () => {
      cancelOpen();
      cancelClose();
    },
    [],
  );

  useEffect(() => {
    if (!position) return;
    const dismiss = () => setPosition(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) dismiss();
    };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [position]);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="ebay-sold-view__media ebay-sold-view__image-trigger"
        aria-label={`Enlarge image: ${title}`}
        aria-expanded={Boolean(position)}
        onMouseEnter={openSoon}
        onMouseLeave={closeSoon}
        onFocus={open}
        onBlur={closeSoon}
        onClick={open}
      >
        <img src={src} alt={title} />
      </button>
      {position &&
        createPortal(
          <div
            className="ebay-sold-view__image-preview"
            style={position}
            onMouseEnter={cancelClose}
            onMouseLeave={closeSoon}
          >
            {imageState === "loading" && (
              <div
                className="ebay-sold-view__image-status"
                role="status"
                aria-label="Loading image"
              >
                <span className="app-loading-spinner" aria-hidden="true" />
              </div>
            )}
            {imageState === "error" && (
              <p className="ebay-sold-view__image-status" role="status">
                Image unavailable
              </p>
            )}
            <img
              src={previewSrc ?? src}
              alt={`Enlarged image: ${title}`}
              style={{
                visibility: imageState === "loaded" ? "visible" : "hidden",
              }}
              onLoad={() => setImageState("loaded")}
              onError={(event) => {
                if (event.currentTarget.getAttribute("src") !== src) {
                  event.currentTarget.src = src;
                } else {
                  setImageState("error");
                }
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
