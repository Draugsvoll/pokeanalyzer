export type RarityBadgeAccent =
  | "neutral"
  | "blue"
  | "green"
  | "yellow"
  | "orange"
  | "pink"
  | "purple"
  | "teal";

function getRarityFamily(rarity?: string | null) {
  const value = rarity?.toLowerCase() ?? "";
  let family = "other";

  if (!value.trim() || value.trim() === "n/a") {
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
    value.includes("shiny") ||
    value.includes("rainbow") ||
    value.includes("gold")
  ) {
    family = "secret";
  } else if (
    value.includes("ultra") ||
    value.includes("double") ||
    value.includes("illustration") ||
    value.includes("full art") ||
    value.includes("trainer gallery") ||
    value.includes("art rare") ||
    value.includes("character")
  ) {
    family = "ultra";
  } else if (
    value.includes("amazing") ||
    value.includes("prism") ||
    value.includes("radiant") ||
    value.includes("ace spec") ||
    value.includes("legend") ||
    value.includes("classic")
  ) {
    family = "special";
  } else if (value.includes("rare")) {
    family = "rare";
  }

  return family;
}

export function getRarityBadgeAccent(
  rarity?: string | null,
): RarityBadgeAccent {
  const family = getRarityFamily(rarity);

  if (family === "common") return "teal";
  if (family === "uncommon") return "green";
  if (family === "rare") return "blue";
  if (family === "ultra") return "orange";
  if (family === "secret") return "pink";
  if (family === "promo") return "teal";
  if (family === "special") return "yellow";
  if (family === "unknown") return "neutral";
  return "purple";
}
