import { SelectDropdown } from "../selectDropdown/SelectDropdown";
import "./RarityFilter.scss";

export function RarityFilter({
  rarities,
  value,
  onChange,
}: {
  rarities: readonly (string | undefined)[];
  value: string;
  onChange: (value: string) => void;
}) {
  const counts = new Map<string, number>();
  for (const rarity of rarities) {
    const name = rarity?.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const names = [...counts.keys()].sort(
    (left, right) =>
      counts.get(left)! - counts.get(right)! ||
      left.localeCompare(right, "en-US"),
  );

  return (
    <SelectDropdown
      ariaLabel="Filter by rarity"
      className="rarity-filter"
      options={[
        { label: "Any rarity", value: "" },
        ...names.map((name) => ({
          label: name,
          secondaryLabel: ` (${counts.get(name)!.toLocaleString("en-US")})`,
          value: name,
        })),
      ]}
      value={value}
      onChange={onChange}
    />
  );
}
