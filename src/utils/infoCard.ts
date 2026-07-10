import {
  LineChart,
  Newspaper,
  ScanSearch,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FeatureStyleColor } from "./featureStylings";

export type InfoCardAction =
  | "navigate-search"
  | "scroll-grader"
  | "navigate-profile"
  | "navigate-news";

export type InfoCardConfig = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  color: FeatureStyleColor;
  action?: InfoCardAction;
};

export type InfoCard = Omit<InfoCardConfig, "action"> & {
  action: () => void;
};

export type InfoCardHandlers = {
  scrollToGrader: () => void;
  navigate: (path: string) => void;
};

export const INFO_CARD_CONFIG: InfoCardConfig[] = [
  {
    id: "grader",
    title: "Kortgradering",
    description: "AI-vurdering av tilstand",
    icon: ScanSearch,
    color: "purple",
  },
  {
    id: "prices",
    title: "Markedspriser",
    description: "TCGPlayer, Cardmarket, eBay",
    icon: LineChart,
    color: "teal",
  },
  {
    id: "portfolio",
    title: "Portefølje",
    description: "Din lagrede samling",
    icon: WalletCards,
    color: "orange",
    action: "navigate-profile",
  },
  {
    id: "news",
    title: "Nyheter",
    description: "Siste fra Pokémon-verdenen",
    icon: Newspaper,
    color: "pink",
    action: "navigate-news",
  },
];

function resolveInfoCardAction(
  action: InfoCardAction | undefined,
  handlers: InfoCardHandlers
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
    default:
      return () => {};
  }
}

export function getInfoCards(handlers: InfoCardHandlers): InfoCard[] {
  return INFO_CARD_CONFIG.map(({ action, ...infoCard }) => ({
    ...infoCard,
    action: resolveInfoCardAction(action, handlers),
  }));
}
