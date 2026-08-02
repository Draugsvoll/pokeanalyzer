import { getCustomColors, type CustomColors } from "../../../utils/customStylings";
import "./CardFeatureHeader.scss";

type CardFeatureHeaderProps = {
  color: CustomColors;
  /** Small accent eyebrow — feature button name */
  featureName: string;
  /** Large analysis title under the eyebrow */
  analysisTitle: string;
};

/**
 * Feature view header — matches product mock:
 * accent eyebrow (feature name) + large analysis title.
 */
export function CardFeatureHeader({
  color,
  featureName,
  analysisTitle,
}: CardFeatureHeaderProps) {
  return (
    <header className="card-feature-header" style={getCustomColors(color)}>
      <p className="card-feature-header__eyebrow">{featureName}</p>
      <h2 className="card-feature-header__title">{analysisTitle}</h2>
    </header>
  );
}
