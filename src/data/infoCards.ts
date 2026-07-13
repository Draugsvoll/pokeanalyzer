import {
  LineChart,
  Newspaper,
  ScanSearch,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { CustomColors } from "../utils/customStylings";

export type InfoCard = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  color: CustomColors;
};

export const INFO_CARDS: InfoCard[] = [
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
  },
  {
    id: "news",
    title: "Nyheter",
    description: "Siste fra Pokémon-verdenen",
    icon: Newspaper,
    color: "pink",
  },
];
