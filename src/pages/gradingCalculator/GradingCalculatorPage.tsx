import { GradingCalculator } from "../pokemonDetails/components/GradingCalculator";
import { GradingOpportunitiesGrid } from "../../components/gradingOpportunitiesGrid/GradingOpportunitiesGrid";
import "./GradingCalculatorPage.scss";

export default function GradingCalculatorPage() {
  return (
    <div className="grading-calculator-page">
      <GradingCalculator />
      <GradingOpportunitiesGrid minimized defaultExpanded />
    </div>
  );
}
