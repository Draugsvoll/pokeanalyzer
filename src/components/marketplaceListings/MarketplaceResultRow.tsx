import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";

export type MarketplaceMetadataItem = { label: string; icon?: ReactNode };
type Props = {
  title: string;
  titleContent?: ReactNode;
  media?: ReactNode;
  metadataItems: MarketplaceMetadataItem[];
  price: string;
  url?: string;
  linkLabel?: string;
  expansion: { expanded: boolean };
};
export function MarketplaceResultRow({
  title,
  titleContent,
  media,
  metadataItems,
  price,
  url,
  linkLabel,
  expansion,
}: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const metadataRef = useRef<HTMLDivElement>(null);
  const [localExpansion, setLocalExpansion] = useState({
    command: expansion,
    expanded: expansion.expanded,
  });
  const titleExpanded =
    localExpansion.command === expansion
      ? localExpansion.expanded
      : expansion.expanded;
  const [titleOverflowing, setTitleOverflowing] = useState(false);
  const [metadataOverflowing, setMetadataOverflowing] = useState(false);
  const hasListingUrl = Boolean(url && /^https?:\/\//i.test(url));
  useLayoutEffect(() => {
    const titleElement = titleRef.current;
    const metadataElement = metadataRef.current;
    if (!titleElement || titleExpanded) return;

    const updateOverflow = () => {
      setTitleOverflowing(
        titleElement.scrollWidth > titleElement.clientWidth + 1,
      );
      if (metadataElement) {
        setMetadataOverflowing(
          metadataElement.scrollWidth > metadataElement.clientWidth + 1,
        );
      }
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateOverflow);
    let mounted = true;
    const animationFrame = window.requestAnimationFrame(updateOverflow);

    updateOverflow();
    resizeObserver?.observe(titleElement);
    if (metadataElement) resizeObserver?.observe(metadataElement);
    window.addEventListener("resize", updateOverflow);
    void document.fonts?.ready.then(() => {
      if (mounted) updateOverflow();
    });
    return () => {
      mounted = false;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateOverflow);
    };
  }, [metadataItems.length, title, titleExpanded]);

  return (
    <article
      className={`marketplace-listings__result${media ? "" : " marketplace-listings__result--without-image"}${titleExpanded ? " marketplace-listings__result--expanded" : ""}`}
    >
      {media && <div className="marketplace-listings__visual">{media}</div>}

      <div className="marketplace-listings__content">
        <header className="marketplace-listings__header">
          <div
            className={`marketplace-listings__title-block${titleOverflowing || metadataOverflowing ? " marketplace-listings__title-block--toggleable" : ""}${titleExpanded ? " marketplace-listings__title-block--expanded" : ""}`}
          >
            <h3 ref={titleRef}>{titleContent ?? title}</h3>
            <div
              className="marketplace-listings__listing-meta"
              ref={metadataRef}
            >
              {metadataItems.map((item, itemIndex) => (
                <span
                  className="marketplace-listings__sold-date"
                  key={`${item.label}-${itemIndex}`}
                >
                  {itemIndex > 0 && <span>{"\u2022"}</span>}
                  {item.icon}
                  {item.label}
                </span>
              ))}
            </div>
            {(titleOverflowing || metadataOverflowing) && (
              <button
                aria-expanded={titleExpanded}
                aria-label={`${titleExpanded ? "Collapse" : "Expand"} listing title`}
                className="marketplace-listings__title-toggle"
                onClick={() =>
                  setLocalExpansion({
                    command: expansion,
                    expanded: !titleExpanded,
                  })
                }
                type="button"
              >
                <ChevronDown aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="marketplace-listings__price">
            <div className="marketplace-listings__price-row">
              <strong>{price}</strong>
            </div>
            {hasListingUrl && (
              <a
                className="app-link marketplace-listings__sale-link"
                href={url}
                onClick={(event) => event.stopPropagation()}
                target="_blank"
                rel="noreferrer"
              >
                {linkLabel} <ExternalLink aria-hidden="true" />
              </a>
            )}
          </div>
        </header>
      </div>
    </article>
  );
}
