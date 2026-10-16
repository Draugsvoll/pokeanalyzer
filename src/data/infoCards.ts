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
      "Scan across different markets to summarize your card’s overall performance.",
    id: "market",
    title: "Market analysis",
    icon: ChartNoAxesCombined,
    color: "orange",
  },
  {
    description:
      "Explore grading insights, collectibility, and what makes your card stand out.",
    id: "insights",
    title: "Grading & collector insights",
    icon: ScanSearch,
    color: "purple",
  },
  {
    description:
      "Browse recent sales and active listings with dedicated filters to narrow your search.",
    id: "ebay",
    title: "eBay sales & listings",
    icon: CircleDollarSign,
    color: "teal",
  },
];
