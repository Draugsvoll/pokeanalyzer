import { useId } from "react";
import { SegmentedRadioGroup } from "../ui/SegmentedRadioGroup";
import "./ProductTypeSwitch.scss";

export type ProductType = "singles" | "sealed";

export function ProductTypeSwitch({
  onChange,
  value,
}: {
  onChange: (value: ProductType) => void;
  value: ProductType;
}) {
  const name = useId();

  return (
    <SegmentedRadioGroup
      ariaLabel="Product type"
      className="product-type-switch"
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
