import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { PokeTraceSealedCatalogProduct } from "../../../shared/pokeTraceSealed";
import { PriceChange } from "../priceChange/PriceChange";
import { ProductCard } from "../productCard/ProductCard";
import { Badge } from "../ui/Badge";
import "./SealedProductView.scss";

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      style: "currency",
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sevenDayChange(product: PokeTraceSealedCatalogProduct) {
  const previous = product.priceSnapshots["7d"];
  if (product.price === null || previous === null || previous <= 0) return null;
  return ((product.price - previous) / previous) * 100;
}

export function SealedProductView({
  product,
}: {
  product: PokeTraceSealedCatalogProduct;
}) {
  const navigate = useNavigate();
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const change = sevenDayChange(product);
  const showImage = Boolean(product.image && failedImageSrc !== product.image);

  return (
    <ProductCard
      as="article"
      className="sealed-product-view"
      surfaceClassName="sealed-product-view__card"
    >
      <button
        aria-label={`Open ${product.name}`}
        className="sealed-product-view__open"
        onClick={() =>
          navigate(`/sealed/${encodeURIComponent(product.id)}`, {
            state: { product },
          })
        }
        type="button"
      />
      <div className="sealed-product-view__image-shell">
        {showImage && (
          <img
            alt=""
            loading="lazy"
            onError={(event) => {
              event.currentTarget.hidden = true;
              setFailedImageSrc(product.image ?? null);
            }}
            src={product.image}
          />
        )}
      </div>
      <div className="product-card__content">
        <h2 className="product-card__title product-card__title--two-lines">
          {product.name}
        </h2>
        <p className="product-card__metadata">{product.setName}</p>
        <div className="product-card__badges">
          <Badge accent="neutral" size="sm">
            {formatLabel(product.productFamily)}
          </Badge>
          {product.variant && (
            <Badge accent="neutral" size="sm">
              {formatLabel(product.variant)}
            </Badge>
          )}
        </div>
        <div className="product-card__price-row">
          <strong className="product-card__price-value">
            {product.price === null
              ? "Price unavailable"
              : formatMoney(product.price, product.currency)}
          </strong>
          <PriceChange
            percent={change}
            period="7d"
            title="Seven-day TCGPlayer unopened price change"
          />
        </div>
      </div>
    </ProductCard>
  );
}
