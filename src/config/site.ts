export const SITE_NAME = "Pokélyzer";

export const SUPPORT_EMAIL =
  import.meta.env.VITE_SUPPORT_EMAIL?.trim() || "contact@pokelyzer.com";

export const SUPPORT_EMAIL_LINK = `mailto:${SUPPORT_EMAIL}`;
