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
    title: "Grading",
    description: "Is your card worth grading? Know exactly what to expect from the grading process",
    icon: ScanSearch,
    color: "blue",
  },
  {
    id: "prices",
    title: "Market analysis",
    description: "Scan the markets, get accurate prices for your condition and marketplaces",
    icon: LineChart,
    color: "teal",
  },
  {
    id: "portfolio",
    title: "Portfolio",
    description: "Keep track of your collection",
    icon: WalletCards,
    color: "orange",
  },
  {
    id: "news",
    title: "News",
    description: "Latest news-worthy events in a summarized format.",
    icon: Newspaper,
    color: "pink",
  },
];
