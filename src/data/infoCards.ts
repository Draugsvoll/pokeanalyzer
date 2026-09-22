import {
  ChartNoAxesCombined,
  CircleDollarSign,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";
import type { CustomColors } from "../utils/customStylings";

export type InfoCard = {
  description: string;
  id: string;
  title: string;
  icon: LucideIcon;
  color: CustomColors;
};

export const INFO_CARDS: InfoCard[] = [
  {
    description:
      "Scan multiple markets for a clear summary of how the card is performing today.",
    id: "market",
    title: "Market analysis",
    icon: ChartNoAxesCombined,
    color: "orange",
  },
  {
    description:
      "Evaluate grading potential and get a complete collector-focused breakdown.",
    id: "insights",
    title: "Grading & collector insights",
    icon: ScanSearch,
    color: "purple",
  },
  {
    description: "Get a clear overview with advanced filtering and sorting.",
    id: "ebay",
    title: "eBay sales & listings",
    icon: CircleDollarSign,
    color: "teal",
  },
];
