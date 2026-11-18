import { useId } from "react";
import { SegmentedRadioGroup } from "../ui/SegmentedRadioGroup";
import "./ProductTypeSwitch.scss";

export type ProductType = "singles" | "sealed";

export function ProductTypeSwitch({
  onChange,
  value,
  variant = "default",
}: {
  onChange: (value: ProductType) => void;
  value: ProductType;
  variant?: "default" | "pill";
}) {
  const name = useId();

  return (
    <SegmentedRadioGroup
      ariaLabel="Product type"
      className={`product-type-switch${variant === "pill" ? " product-type-switch--pill" : ""}`}
      name={`product-type-${name}`}
      onChange={onChange}
      options={[
        { label: "Singles", value: "singles" },
        { label: "Sealed", value: "sealed" },
      ]}
      size="small"
      value={value}
    />
  );
}
