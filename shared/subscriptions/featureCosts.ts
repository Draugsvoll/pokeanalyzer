export function getFeatureCreditCost(feature: string) {
  return feature === "worth_grading" ? 2 : 1;
}

export function getFeatureCreditLabel(feature: string) {
  const credits = getFeatureCreditCost(feature);
  return `${credits} ${credits === 1 ? "Credit" : "Credits"}`;
}
