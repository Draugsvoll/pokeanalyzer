import type { ReactNode } from "react";
import { SEARCH_HERO_CONTENT } from "../../data/searchHeroContent";
import {
  ProductTypeSwitch,
  type ProductType,
} from "../productTypeSwitch/ProductTypeSwitch";
import { Badge } from "../ui/Badge";
import "./SearchHero.scss";

type SearchHeroProps = {
  children: ReactNode;
  eyebrow?: string;
  onProductTypeChange: (value: ProductType) => void;
  productType: ProductType;
  subtitle?: string;
  title?: string;
};

export function SearchHero({
  children,
  eyebrow = SEARCH_HERO_CONTENT.eyebrow,
  onProductTypeChange,
  productType,
  subtitle = SEARCH_HERO_CONTENT.subtitle,
  title = SEARCH_HERO_CONTENT.title,
}: SearchHeroProps) {
  return (
    <header className="search-hero ui-render-fade">
      <span className="search-hero__eyebrow">
        <Badge accent="blue" size="sm" weight="strong">
          {eyebrow}
        </Badge>
      </span>
      <h1 className="search-hero__title">{title}</h1>
      <p className="search-hero__subtitle">{subtitle}</p>
      <div className="search-hero__search">
        <ProductTypeSwitch onChange={onProductTypeChange} value={productType} />
        {children}
      </div>
    </header>
  );
}
