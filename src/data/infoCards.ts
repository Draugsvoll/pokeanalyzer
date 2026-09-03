import {
  Gem,
  BadgeDollarSign,
  ScanSearch,
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
    description:
      "Everything you need to know about the grading decision from start to finish.",
    icon: ScanSearch,
    color: "pink",
  },
  // {
  //   id: "prices",
  //   title: "Market Analysis",
  //   description: "Scan multiple market sources and variants for your card.",
  //   icon: LineChart,
  //   color: "orange",
  // },
  {
    id: "collectorsanalysis",
    title: "Collector's Analysis",
    description: "Learn all you need to know about the card as a collectable.",
    icon: Gem,
    color: "blue",
  },
  {
    id: "ebay",
    title: "eBay Comps",
    description: "View both active listings and completed sales for any card.",
    icon: BadgeDollarSign,
    color: "teal",
  },
];
