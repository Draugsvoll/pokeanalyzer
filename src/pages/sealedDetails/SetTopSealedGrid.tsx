import { POKETRACE_SEALED_SEARCH_RESULT_LIMIT } from "../../../shared/pokeTraceSealed";
import { GridView } from "../../components/gridView/GridView";
import { SealedProductView } from "../../components/sealedProductView/SealedProductView";
import { searchSealedProducts } from "../../services/sealedApi";
import { useSetRecommendations } from "../../hooks/useSetRecommendations";

async function loadTopProducts(setName: string, signal: AbortSignal) {
  const { items, total } = await searchSealedProducts(
    { name: "", productFamily: "", setName },
    signal,
  );
  // Do not rank a potentially incomplete response or change search caps.
  if (
    signal.aborted ||
    items.length >= POKETRACE_SEALED_SEARCH_RESULT_LIMIT ||
    total !== items.length
  )
    return [];
  const normalizedName = setName.toLocaleLowerCase("en-US");
  return items
    .filter(
      (product) =>
        product.setName.trim().toLocaleLowerCase("en-US") === normalizedName &&
        product.price !== null &&
        Number.isFinite(product.price) &&
        product.price > 0,
    )
    .sort(
      (left, right) =>
        (right.price ?? 0) - (left.price ?? 0) ||
        left.id.localeCompare(right.id, "en-US"),
    )
    .slice(0, 12);
}

export function SetTopSealedGrid({ setName }: { setName?: string }) {
  const name = setName?.trim() ?? "";
  const products = useSetRecommendations(name, loadTopProducts);
  if (!products?.length) return null;

  return (
    <GridView
      key={name}
      minimized
      subtitle={name}
      title="Most Valuable in This Set"
    >
      {products.map((product) => (
        <SealedProductView key={product.id} product={product} />
      ))}
    </GridView>
  );
}
