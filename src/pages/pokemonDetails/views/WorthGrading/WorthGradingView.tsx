import { Layers3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { GrokRequestState } from "../../../../utils/grok/grokClient";
import { formatCardVariantTitle } from "../../../../utils/cardVariantTitle";
import { LoadingState } from "../../../../components/loadingState/LoadingState";
import { FEATURE_ERROR_MESSAGE } from "../featureError";
import "./WorthGradingView.scss";

type WorthGradingViewProps = {
  cardName: string;
  grokRequest: GrokRequestState;
};

type WorthGradingResponse = {
  html?: string;
  verdict?: string;
  summary?: string;
  action?: string;
};

type WorthGradingVariantSection = {
  html: string;
  title: string;
};

type WorthGradingRenderItem =
  | {
      html: string;
      type: "html";
    }
  | {
      type: "variants";
      variants: WorthGradingVariantSection[];
    };

const ALLOWED_TAGS = new Set([
  "A",
  "ARTICLE",
  "DIV",
  "EM",
  "H2",
  "H3",
  "LI",
  "MAIN",
  "P",
  "SECTION",
  "SPAN",
  "STRONG",
  "TABLE",
  "TBODY",
  "TD",
  "TH",
  "THEAD",
  "TR",
  "UL",
]);

const ALLOWED_CLASSES = new Set([
  "break-even",
  "breakeven",
  "card",
  "cost-grid",
  "featured",
  "feature-section-heading",
  "grade",
  "loss",
  "marginal",
  "negative",
  "neutral",
  "note",
  "positive",
  "price",
  "profit",
  "recommendation",
  "recommendation--caution",
  "recommendation--marginal",
  "recommendation--negative",
  "recommendation--positive",
  "section",
  "source",
  "summary-grid",
  "table-wrap",
  "muted",
  "warning",
]);

function stripCodeFence(response: string) {
  return response
    .trim()
    .replace(/^```(?:html|json)?\s*/i, "")
    .replace(/\s*```$/i, "");
}

function parseJsonResponse(response: string): WorthGradingResponse | null {
  try {
    return JSON.parse(stripCodeFence(response));
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  const element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML;
}

function readSignedAmount(value: string) {
  const normalized = value.replace(/[\s,$€£]/g, "").replace(/[−–—]/g, "-");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const amount = Number(match[0]);
  return Number.isFinite(amount) ? amount : null;
}

function legacyJsonToHtml(data: WorthGradingResponse, cardName: string) {
  if (typeof data.html === "string") {
    return sanitizeWorthGradingHtml(data.html, cardName);
  }

  const paragraphs = [data.summary, data.action]
    .filter(Boolean)
    .map((item) => `<p>${escapeHtml(item ?? "")}</p>`)
    .join("");

  return `<section><h2>${escapeHtml(
    data.verdict ?? "Grading verdict unavailable",
  )}</h2>${paragraphs}</section>`;
}

function sanitizeWorthGradingHtml(response: string, cardName: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(stripCodeFence(response), "text/html");
  const source = document.body;

  source.querySelectorAll("script, style, link, meta, title").forEach((node) => {
    node.remove();
  });

  const cleanNode = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.textContent ?? "");
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toUpperCase();

    if (!ALLOWED_TAGS.has(tagName)) {
      const fragment = document.createDocumentFragment();
      element.childNodes.forEach((child) => {
        const cleanChild = cleanNode(child);
        if (cleanChild) fragment.append(cleanChild);
      });
      return fragment;
    }

    const cleanElement = document.createElement(tagName.toLowerCase());
    const classNames = Array.from(element.classList).filter((className) =>
      ALLOWED_CLASSES.has(className),
    );

    if (classNames.length > 0) {
      cleanElement.className = classNames.join(" ");
    }

    if (tagName === "A") {
      const href = element.getAttribute("href");
      if (href?.startsWith("https://")) {
        cleanElement.setAttribute("href", href);
        cleanElement.setAttribute("rel", "noreferrer");
        cleanElement.setAttribute("target", "_blank");
      }
    }

    element.childNodes.forEach((child) => {
      const cleanChild = cleanNode(child);
      if (cleanChild) cleanElement.append(cleanChild);
    });

    return cleanElement;
  };

  const container = document.createElement("div");
  source.childNodes.forEach((child) => {
    const cleanChild = cleanNode(child);
    if (cleanChild) container.append(cleanChild);
  });

  container.querySelectorAll(".cost-grid .muted").forEach((element) => {
    const text = element.textContent?.trim() ?? "";
    if (!text || /:\s*$/.test(text)) {
      element.remove();
    }
  });

  container.querySelectorAll("section h3").forEach((heading) => {
    if (heading.textContent?.trim().toLowerCase() === "notes") {
      heading.remove();
    }
  });

  container.querySelectorAll(".summary-grid .card > h3").forEach((heading) => {
    heading.textContent = formatCardVariantTitle(
      heading.textContent ?? "",
      cardName,
    );
  });

  container.querySelectorAll("section > h2").forEach((heading) => {
    const section = heading.closest("section");
    const headingText = heading.textContent?.trim().toLowerCase() ?? "";

    if (headingText === "conclusion") {
      heading.textContent = "Recommendation";
      return;
    }

    if (section?.querySelector(".cost-grid")) {
      heading.textContent = "PSA Grading Fees";
      return;
    }

    if (!section?.querySelector(".table-wrap table")) return;

    const title = heading.textContent?.trim() ?? "";
    heading.textContent = formatCardVariantTitle(title, cardName);
  });

  container.querySelectorAll("h2").forEach((heading) => {
    heading.classList.add("feature-section-heading");
  });

  container.querySelectorAll(".cost-grid .card").forEach((element) => {
    const price = element.querySelector(".price")?.textContent?.trim() ?? "";
    const mutedDetails = Array.from(element.querySelectorAll(".muted")).some(
      (detail) => Boolean(detail.textContent?.trim()),
    );

    if (!price && !mutedDetails) {
      element.remove();
    }
  });

  container.querySelectorAll(".cost-grid").forEach((element) => {
    if (!element.querySelector(".card")) {
      element.closest("section")?.remove();
    }
  });

  container.querySelectorAll("td").forEach((cell) => {
    if (!cell.textContent?.trim()) {
      cell.textContent = "—";
    }
  });

  container.querySelectorAll(".recommendation").forEach((element) => {
    const text = element.textContent?.trim().toLowerCase() ?? "";
    element.classList.remove(
      "recommendation--positive",
      "recommendation--caution",
      "recommendation--marginal",
      "recommendation--negative",
    );

    if (text === "worth grading") {
      element.classList.add("recommendation--positive");
    } else if (text === "only if high-grade" || text === "only on high-grades") {
      element.classList.add("recommendation--caution");
    } else if (text === "marginal") {
      element.classList.add("recommendation--marginal");
    } else if (text === "not recommended") {
      element.classList.add("recommendation--negative");
    }
  });

  container.querySelectorAll(".profit").forEach((element) => {
    const amount = readSignedAmount(element.textContent ?? "");
    element.classList.remove("positive", "negative", "loss", "neutral", "profit");
    if (amount == null) return;

    if (amount > 0) element.classList.add("positive");
    else if (amount < 0) element.classList.add("negative");
    else element.classList.add("neutral");
  });

  container.querySelectorAll("table").forEach((table) => {
    const headers = Array.from(table.querySelectorAll("thead th"));
    const profitColumnIndex = headers.findIndex((header) =>
      /profit/i.test(header.textContent ?? ""),
    );
    if (profitColumnIndex < 0) return;

    table.querySelectorAll("tbody tr").forEach((row) => {
      const cell = row.children.item(profitColumnIndex);
      if (!cell) return;

      const amount = readSignedAmount(cell.textContent ?? "");
      row.classList.remove("positive", "negative", "loss", "neutral", "profit");
      cell.classList.remove("positive", "negative", "loss", "neutral", "profit");
      if (amount == null) return;

      if (amount > 0) cell.classList.add("positive");
      else if (amount < 0) cell.classList.add("negative");
      else cell.classList.add("neutral");
    });
  });

  return container.innerHTML;
}

function createWorthGradingRenderItems(
  html: string,
  cardName: string,
): WorthGradingRenderItem[] {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  const source =
    document.body.children.length === 1 &&
    document.body.firstElementChild?.tagName.toLowerCase() === "main"
      ? document.body.firstElementChild
      : document.body;
  const beforeVariantSections: WorthGradingRenderItem[] = [];
  const afterVariantSections: WorthGradingRenderItem[] = [];
  const variants: WorthGradingVariantSection[] = [];
  let foundVariantSection = false;

  Array.from(source.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) return;

    if (node.nodeType !== Node.ELEMENT_NODE) {
      const htmlContent = node.textContent ?? "";
      if (htmlContent.trim()) {
        (foundVariantSection ? afterVariantSections : beforeVariantSections).push(
          { html: htmlContent, type: "html" },
        );
      }
      return;
    }

    const element = node as HTMLElement;
    const isVariantSection = Boolean(element.querySelector(".table-wrap table"));

    if (isVariantSection) {
      foundVariantSection = true;
      const clone = element.cloneNode(true) as HTMLElement;
      const heading = Array.from(clone.children).find(
        (child) => child.tagName.toLowerCase() === "h2",
      );
      const title = heading?.textContent?.trim() || cardName;
      heading?.remove();
      variants.push({ html: clone.innerHTML, title });
      return;
    }

    (foundVariantSection ? afterVariantSections : beforeVariantSections).push({
      html: element.outerHTML,
      type: "html",
    });
  });

  return variants.length > 0
    ? [
        ...beforeVariantSections,
        { type: "variants", variants },
        ...afterVariantSections,
      ]
    : [...beforeVariantSections, ...afterVariantSections];
}

export function WorthGradingView({
  cardName,
  grokRequest,
}: WorthGradingViewProps) {
  const { loading, error, response } = grokRequest;
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);

  useEffect(() => {
    setSelectedVariantIndex(0);
  }, [response]);

  const html = useMemo(() => {
    if (!response) return "";

    const data = parseJsonResponse(response);
    return data
      ? legacyJsonToHtml(data, cardName)
      : sanitizeWorthGradingHtml(response, cardName);
  }, [cardName, response]);
  const renderItems = useMemo(
    () => (html.trim() ? createWorthGradingRenderItems(html, cardName) : []),
    [cardName, html],
  );

  if (loading) return <LoadingState>Researching grading value...</LoadingState>;
  if (error) {
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  }
  if (!response) return null;

  if (!html.trim()) {
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;
  }

  return (
    <section className="worth-grading-view ui-render-fade">
      <article className="worth-grading-view__card worth-grading-view__html">
        {renderItems.map((item, itemIndex) => {
          if (item.type === "html") {
            return (
              <div
                className="worth-grading-view__html-fragment"
                dangerouslySetInnerHTML={{ __html: item.html }}
                key={`html-${itemIndex}`}
              />
            );
          }

          const activeVariantIndex = item.variants[selectedVariantIndex]
            ? selectedVariantIndex
            : 0;
          const activeVariant = item.variants[activeVariantIndex];

          return (
            <section
              className="worth-grading-view__variant-panel"
              key={`variants-${itemIndex}`}
            >
              <h2 className="feature-section-heading">Grading Details</h2>
              <fieldset
                aria-label="Worth grading variant"
                className="worth-grading-view__variant-selector feature-variant-radio-group"
              >
                <div>
                  {item.variants.map((variant, variantIndex) => (
                    <label key={`${variant.title}-${variantIndex}`}>
                      <input
                        checked={activeVariantIndex === variantIndex}
                        name={`worth-grading-variant-${itemIndex}`}
                        type="radio"
                        value={variantIndex}
                        onChange={() => setSelectedVariantIndex(variantIndex)}
                      />
                      <span>
                        <Layers3 aria-hidden="true" />
                        <strong>{variant.title}</strong>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {activeVariant && (
                <div
                  className="worth-grading-view__variant-detail"
                  dangerouslySetInnerHTML={{ __html: activeVariant.html }}
                />
              )}
            </section>
          );
        })}
      </article>
    </section>
  );
}
