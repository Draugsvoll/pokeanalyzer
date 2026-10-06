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
  return (
    <SegmentedRadioGroup
      ariaLabel="Product type"
      className="product-type-switch"
      name="product-type"
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
