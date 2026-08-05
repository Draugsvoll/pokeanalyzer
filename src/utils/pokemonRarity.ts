export function getRarityBadgeClassName(rarity?: string | null) {
  const value = rarity?.toLowerCase() ?? "";
  let family = "rare";

  if (!value.trim()) {
    family = "unknown";
  } else if (value.includes("common") && !value.includes("uncommon")) {
    family = "common";
  } else if (value.includes("uncommon")) {
    family = "uncommon";
  } else if (value.includes("promo")) {
    family = "promo";
  } else if (
    value.includes("secret") ||
    value.includes("hyper") ||
    value.includes("shiny")
  ) {
    family = "secret";
  } else if (
    value.includes("ultra") ||
    value.includes("double") ||
    value.includes("illustration")
  ) {
    family = "ultra";
  } else if (
    value.includes("amazing") ||
    value.includes("prism") ||
    value.includes("radiant") ||
    value.includes("ace spec") ||
    value.includes("legend")
  ) {
    family = "special";
  }

  return `card-rarity-badge card-rarity-badge--${family}`;
}
