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

type JustTcgVariantsProps = {
  response: unknown;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseVariants(response: unknown): JustTcgVariant[] {
  if (!isRecord(response) || !Array.isArray(response.data)) return [];

  return response.data.flatMap((card, cardIndex) => {
    if (!isRecord(card) || !Array.isArray(card.variants)) return [];

    return card.variants
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
  const variants = parseVariants(response);

  if (!variants.length) {
    return <p className="just-tcg-variants__empty">No JustTCG variants were returned.</p>;
  }

  const groups = Object.entries(
    variants.reduce<Record<string, JustTcgVariant[]>>((result, variant) => {
      (result[variant.printing] ??= []).push(variant);
      return result;
    }, {})
  ).map(([printing, groupedVariants]) => [
    printing,
    [...groupedVariants].sort((first, second) => (second.price ?? -Infinity) - (first.price ?? -Infinity)),
  ] as const);

  return (
    <div className="just-tcg-variants">
      {groups.map(([printing, groupedVariants]) => {
        const reverse = printing.toLowerCase().includes("reverse");

        return (
          <section
            className={`just-tcg-variants__section${reverse ? " just-tcg-variants__section--reverse" : ""}`}
            key={printing}
          >
            <header>
              <div><Layers3 aria-hidden="true" /><span>{printing}</span></div>
              <small>Sorted by price (desc)</small>
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
                  {groupedVariants.map((variant) => {
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
