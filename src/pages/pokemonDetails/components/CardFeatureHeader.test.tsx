import { render, screen } from "@testing-library/react";
import { CircleDollarSign } from "lucide-react";
import { expect, test } from "vitest";
import { CardFeatureHeader } from "./CardFeatureHeader";
import { MarketAnalysisView } from "../views/MarketAnalysis/MarketAnalysisView";
import CollectorAnalysis from "../views/CollectorAnalysis/CollectorAnalysisView";
import { WorthGradingView } from "../views/WorthGrading/WorthGradingView";
import { FEATURE_ERROR_MESSAGE } from "../views/featureError";

test.each([
  ["market", MarketAnalysisView],
  ["collector", CollectorAnalysis],
  ["grading", WorthGradingView],
] as const)("%s results do not render a separate loading message", (_, View) => {
  const { container } = render(
    <View grokRequest={{ loading: true, error: "", response: "" }} />,
  );
  expect(container).toBeEmptyDOMElement();
});

test.each([
  ["market", MarketAnalysisView],
  ["collector", CollectorAnalysis],
  ["grading", WorthGradingView],
] as const)("contains invalid %s response errors in the header with its action", (_, View) => {
  render(
    <View
      grokRequest={{ loading: false, error: "", response: "{}" }}
      errorFallback={
        <CardFeatureHeader
          card={{ name: "Pikachu" }}
          color="teal"
          icon={CircleDollarSign}
          label="Analysis"
          actionLabel="1 AI credit"
          onAction={() => undefined}
          errorMessage={FEATURE_ERROR_MESSAGE}
        />
      }
    />,
  );
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent(FEATURE_ERROR_MESSAGE);
  expect(screen.getByRole("button", { name: "1 AI credit" }).closest("header"))
    .toContainElement(alert);
  expect(screen.getAllByText(FEATURE_ERROR_MESSAGE)).toHaveLength(1);
});
