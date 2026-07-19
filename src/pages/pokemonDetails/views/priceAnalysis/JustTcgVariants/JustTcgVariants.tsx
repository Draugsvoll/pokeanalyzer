import { Layers3 } from "lucide-react";
import "./JustTcgVariants.scss";

type JsonRecord = Record<string, unknown>;

type JustTcgVariant = {
  id: string;
  condition: string;
  printing: string;
  price?: number;
  allTimeHigh?: number;
  allTimeLow?: number;
};

type JustTcgVariantGroup = {
  id: string;
  pokemonName: string;
  printing: string;
  setName: string;
  variants: JustTcgVariant[];
};

type JustTcgVariantsProps = {
  response: unknown;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseVariantGroups(response: unknown): JustTcgVariantGroup[] {
  if (!isRecord(response) || !Array.isArray(response.data)) return [];

  return response.data.flatMap((card, cardIndex) => {
    if (!isRecord(card) || !Array.isArray(card.variants)) return [];

    const cardId = String(card.id ?? cardIndex);
    const pokemonName =
      typeof card.name === "string" && card.name
        ? card.name
        : "Unknown card";
    const setName =
      typeof card.set_name === "string" && card.set_name
        ? card.set_name
        : "Unknown set";
    const variants = card.variants
      .filter(isRecord)
      .map((variant, variantIndex) => ({
        id:
          typeof variant.id === "string"
            ? variant.id
            : `${String(card.id ?? cardIndex)}-${variantIndex}`,
        condition:
          typeof variant.condition === "string" && variant.condition
            ? variant.condition
            : "Unknown condition",
        printing:
          typeof variant.printing === "string" && variant.printing
            ? variant.printing
            : "Unknown printing",
        price: optionalNumber(variant.price),
        allTimeHigh: optionalNumber(variant.maxPriceAllTime),
        allTimeLow: optionalNumber(variant.minPriceAllTime),
      }));

    return Object.entries(
      variants.reduce<Record<string, JustTcgVariant[]>>((groups, variant) => {
        (groups[variant.printing] ??= []).push(variant);
        return groups;
      }, {})
    ).map(([printing, groupedVariants]) => ({
      id: `${cardId}-${printing}`,
      pokemonName,
      printing,
      setName,
      variants: [...groupedVariants].sort(
        (first, second) =>
          (second.price ?? -Infinity) - (first.price ?? -Infinity)
      ),
    }));
  });
}

function formatUsd(value: number | undefined): string {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function JustTcgVariants({ response }: JustTcgVariantsProps) {
  const groups = parseVariantGroups(response);

  if (!groups.length) {
    return <p className="just-tcg-variants__empty">No JustTCG variants were returned.</p>;
  }

  return (
    <div className="just-tcg-variants ui-render-fade">
      <header className="just-tcg-variants__source-header">
        <h2 className="app-subheader">JustTCG (Aggregator of price data)</h2>
      </header>
      {groups.map(({ id, pokemonName, printing, setName, variants }) => {
        const reverse = printing.toLowerCase().includes("reverse");

        return (
          <section
            className={`just-tcg-variants__section${reverse ? " just-tcg-variants__section--reverse" : ""}`}
            key={id}
          >
            <header>
              <div className="just-tcg-variants__heading">
                <div className="just-tcg-variants__printing"><Layers3 aria-hidden="true" /><span>{printing}</span></div>
                <div className="just-tcg-variants__identity">
                  <strong className="just-tcg-variants__pokemon-name">{pokemonName}</strong>
                  <i aria-hidden="true">•</i>
                  <span className="just-tcg-variants__set-name">{setName}</span>
                </div>
              </div>
              <small>Sorted by price</small>
            </header>

            <div className="just-tcg-variants__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Condition</th>
                    <th>Current Price</th>
                    <th>Below ATH</th>
                    <th>All-Time High</th>
                    <th>All-Time Low</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((variant) => {
                    const canCalculateBelowAth =
                      variant.price !== undefined &&
                      variant.allTimeHigh !== undefined &&
                      variant.allTimeHigh > 0;
                    const belowAmount = canCalculateBelowAth
                      ? Math.max(0, variant.allTimeHigh! - variant.price!)
                      : undefined;
                    const belowPercent = canCalculateBelowAth
                      ? (belowAmount! / variant.allTimeHigh!) * 100
                      : undefined;

                    return (
                      <tr key={variant.id}>
                        <td>{variant.condition}</td>
                        <td className="just-tcg-variants__current">{formatUsd(variant.price)}</td>
                        <td className="just-tcg-variants__below">
                          {belowAmount === undefined ? (
                            "—"
                          ) : (
                            <><span>-{formatUsd(belowAmount)}</span><small>({belowPercent!.toFixed(1)}%)</small></>
                          )}
                        </td>
                        <td className="just-tcg-variants__high">{formatUsd(variant.allTimeHigh)}</td>
                        <td className="just-tcg-variants__low">{formatUsd(variant.allTimeLow)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
