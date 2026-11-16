import { GradingCalculator } from "../pokemonDetails/components/GradingCalculator";
import { GradingOpportunitiesGrid } from "../../components/gradingOpportunitiesGrid/GradingOpportunitiesGrid";
import "./GradingCalculatorPage.scss";

export default function GradingCalculatorPage() {
  return (
    <div className="grading-calculator-page">
      <header className="grading-calculator-page__header">
        <span className="app-subheader">Tools</span>
        <h1>Grading Calculator</h1>
      </header>
      <GradingCalculator />
      <GradingOpportunitiesGrid minimized defaultExpanded />
    </div>
  );
}
