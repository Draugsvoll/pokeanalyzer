import {
  Gem,
  LineChart,
  Newspaper,
  ScanSearch,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type FeatureCardAction =
  | "navigate-search"
  | "scroll-grader"
  | "navigate-profile"
  | "navigate-news";

export type FeatureCardConfig = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  action: FeatureCardAction;
  detailsOnly?: boolean;
};

export type FeatureCard = Omit<FeatureCardConfig, "action"> & {
  action: () => void;
};

export type FeatureCardHandlers = {
  scrollToGrader: () => void;
  navigate: (path: string) => void;
};

export const FEATURE_CARD_CONFIG: FeatureCardConfig[] = [
  {
    id: "grader",
    title: "Kortgradering",
    description: "AI-vurdering av tilstand",
    icon: ScanSearch,
    accent: "#a855f7",
    action: "scroll-grader",
  },
  {
    id: "prices",
    title: "Markedspriser",
    description: "TCGPlayer, Cardmarket, eBay",
    icon: LineChart,
    accent: "#14b8a6",
    action: "navigate-search",
  },
  {
    id: "samlerverdi",
    title: "Samlerverdi",
    description: "AI-rangering for samlere",
    icon: Gem,
    accent: "#eab308",
    action: "navigate-search",
    detailsOnly: true,
  },
  {
    id: "portfolio",
    title: "Portefølje",
    description: "Din lagrede samling",
    icon: WalletCards,
    accent: "#f59e0b",
    action: "navigate-profile",
  },
  {
    id: "news",
    title: "Nyheter",
    description: "Siste fra Pokémon-verdenen",
    icon: Newspaper,
    accent: "#f43f5e",
    action: "navigate-news",
  },
];

function resolveFeatureCardAction(
  action: FeatureCardAction,
  handlers: FeatureCardHandlers
): () => void {
  switch (action) {
    case "navigate-search":
      return () => handlers.navigate("/search");
    case "scroll-grader":
      return handlers.scrollToGrader;
    case "navigate-profile":
      return () => handlers.navigate("/profile");
    case "navigate-news":
      return () => handlers.navigate("/news");
  }
}

export function getFeatureCards(handlers: FeatureCardHandlers): FeatureCard[] {
  return FEATURE_CARD_CONFIG.filter((card) => !card.detailsOnly).map(({ action, ...card }) => ({
    ...card,
    action: resolveFeatureCardAction(action, handlers),
  }));
}
