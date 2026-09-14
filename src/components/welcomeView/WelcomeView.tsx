import React from "react";
import { ArrowRight, Layers3 } from "lucide-react";
import { Link } from "react-router-dom";
import "./WelcomeView.scss";
import { INFO_CARDS } from "../../data/infoCards";
import { getCustomColors } from "../../utils/customStylings";
import { DatabaseSearch } from "../databaseSearch/DatabaseSearch";

export const WelcomeView: React.FC = () => {
  return (
    <div className="welcome-view">
      <DatabaseSearch />

      <section className="info-cards">
        <div className="info-cards__row">
          {INFO_CARDS.map((infoCard) => {
            const Icon = infoCard.icon;

            return (
              <article
                key={infoCard.id}
                className="info-card"
                style={getCustomColors(infoCard.color)}
              >
                <span className="info-card__icon" aria-hidden="true">
                  <Icon size={22} strokeWidth={2} />
                </span>
                <span className="info-card__text">
                  <span className="info-card__title">{infoCard.title}</span>
                  <span className="info-card__description">
                    {infoCard.description}
                  </span>
                </span>
              </article>
            );
          })}
        </div>
      </section>

      <div className="welcome-view__demo">
        <span className="welcome-view__demo-icon" aria-hidden="true">
          <Layers3 size={20} strokeWidth={1.8} />
        </span>
        <div className="welcome-view__demo-copy">
          <span className="welcome-view__demo-eyebrow">Featured demo</span>
          <strong>Base Set Charizard</strong>
          <p>
            Explore prices, collector analysis, grading, and eBay comps. No
            sign-in needed.
          </p>
        </div>
        <Link className="welcome-view__demo-link" to="/card/demo">
          Explore demo
          <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
};
