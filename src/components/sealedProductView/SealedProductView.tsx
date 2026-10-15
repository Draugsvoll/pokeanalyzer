import { AssetSaveActions } from "../assetSaveActions/AssetSaveActions";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { PokeTraceSealedCatalogProduct } from "../../../shared/pokeTraceSealed";
import {
  formatPriceChangePeriodLong,
  type PriceChangePeriod,
} from "../../../shared/priceChangePeriod";
import { formatPokeTraceMoney } from "../../../shared/pokeTraceCurrency";
import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import { useSealedPortfolio } from "../../hooks/sealedPortfolio";
import type { PortfolioSealedProduct } from "../../types/portfolio";
import { PriceChange } from "../priceChange/PriceChange";
import { PortfolioItemCard } from "../portfolioItemCard/PortfolioItemCard";
import { ProductCard } from "../productCard/ProductCard";
import { Badge } from "../ui/Badge";
import "./SealedProductView.scss";

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function priceChange(
  product: PokeTraceSealedCatalogProduct,
  period: PriceChangePeriod,
) {
  const previous = product.priceSnapshots[period];
  if (product.price === null || previous === null || previous <= 0) return null;
  return ((product.price - previous) / previous) * 100;
}

export function SealedProductView({
  comparisonPeriod = "7d",
  onPortfolioChanged,
  product,
}: {
  comparisonPeriod?: PriceChangePeriod;
  onPortfolioChanged?: (saved: boolean) => void;
  product: PokeTraceSealedCatalogProduct;
}) {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const { isItemSaved, loadingPortfolioReferences, portfolioReferencesError } =
    usePortfolioCache();
  const { saveSealedToPortfolio, removeSealedFromPortfolio } =
    useSealedPortfolio();
  const [updatingPortfolio, setUpdatingPortfolio] = useState(false);
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const change = priceChange(product, comparisonPeriod);
  const showImage = Boolean(product.image && failedImageSrc !== product.image);
  const productIsSaved = isItemSaved("sealed", product.id);
  const portfolioBusy =
    updatingPortfolio || (Boolean(authUser) && loadingPortfolioReferences);
  const portfolioUnavailable =
    Boolean(authUser) && Boolean(portfolioReferencesError);

  async function handlePortfolioToggle() {
    if (
      updatingPortfolio ||
      loadingPortfolioReferences ||
      portfolioUnavailable
    ) {
      return;
    }
    setUpdatingPortfolio(true);
    try {
      const success = productIsSaved
        ? await removeSealedFromPortfolio(product.id, false)
        : await saveSealedToPortfolio(product);
      if (success) onPortfolioChanged?.(!productIsSaved);
    } finally {
      setUpdatingPortfolio(false);
    }
  }

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
      {authUser && (
        <AssetSaveActions
          key={product.id}
          item={{ ...product, type: "sealed" }}
          layout="card"
          portfolio={{
            saved: productIsSaved,
            busy: portfolioBusy,
            unavailable: portfolioUnavailable,
            onToggle: handlePortfolioToggle,
          }}
        />
      )}
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
              : formatPokeTraceMoney(product.price)}
          </strong>
          <PriceChange
            percent={change}
            period={comparisonPeriod}
            title={`${formatPriceChangePeriodLong(comparisonPeriod)} TCGPlayer unopened price change`}
          />
        </div>
      </div>
    </ProductCard>
  );
}

type SealedProductPortfolioViewProps = {
  comparisonPeriod: PriceChangePeriod;
  onQuantityDialogOpenChange?: (open: boolean) => void;
  onQuantityUpdated?: (productId: string, quantity: number) => void;
  onRemoved?: (productId: string) => void;
  product: PortfolioSealedProduct;
  quantityDialogOpen?: boolean;
};

export function SealedProductPortfolioView({
  comparisonPeriod,
  onQuantityDialogOpenChange,
  onQuantityUpdated,
  onRemoved,
  product,
  quantityDialogOpen,
}: SealedProductPortfolioViewProps) {
  const { updateSealedQuantity } = useSealedPortfolio();
  const { isItemUpdating } = usePortfolioCache();
  const quantity = product.quantity;

  return (
    <PortfolioItemCard
      busy={isItemUpdating("sealed", product.id)}
      className="sealed-product-portfolio-view"
      itemName={product.name}
      onQuantityDialogOpenChange={onQuantityDialogOpenChange}
      quantity={quantity}
      quantityDialogOpen={quantityDialogOpen}
      updateQuantity={async (nextQuantity) => {
        const updated = await updateSealedQuantity(product.id, nextQuantity);
        if (updated) onQuantityUpdated?.(product.id, nextQuantity);
        return updated;
      }}
    >
      <SealedProductView
        comparisonPeriod={comparisonPeriod}
        onPortfolioChanged={(saved) => {
          if (!saved) onRemoved?.(product.id);
        }}
        product={product}
      />
    </PortfolioItemCard>
  );
}
