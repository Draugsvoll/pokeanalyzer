import type { ReactNode } from "react";
import { SEARCH_HERO_CONTENT } from "../../data/searchHeroContent";
import { Badge } from "../ui/Badge";
import "./SearchHero.scss";

type SearchHeroProps = {
  children: ReactNode;
};

export function SearchHero({ children }: SearchHeroProps) {
  return (
    <header className="search-hero">
      <span className="search-hero__eyebrow">
        <Badge accent="blue" size="sm" weight="strong">
          {SEARCH_HERO_CONTENT.eyebrow}
        </Badge>
      </span>
      <h1 className="search-hero__title">{SEARCH_HERO_CONTENT.title}</h1>
      <p className="search-hero__subtitle">{SEARCH_HERO_CONTENT.subtitle}</p>
      <div className="search-hero__search">{children}</div>
    </header>
  );
}
