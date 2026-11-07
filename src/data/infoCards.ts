import {
  ChartNoAxesCombined,
  Calculator,
  Layers,
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
      "Compare sold prices and active listings side by side, with filters to narrow your research.",
    id: "market",
    title: "Market research",
    icon: ChartNoAxesCombined,
    color: "yellow",
  },
  {
    description:
      "Estimate profit for individual grades or probability-weighted outcomes, including grading costs and selling fees.",
    id: "grading",
    title: "Grading calculator",
    icon: Calculator,
    color: "purple",
  },
  {
    description:
      "Browse sets, track their market performance, and discover individual cards.",
    id: "sets",
    title: "Set explorer",
    icon: Layers,
    color: "teal",
  },
];
