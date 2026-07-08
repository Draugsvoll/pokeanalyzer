import React from "react";
import "./Frontpage.scss";
import { useNavigate } from "react-router-dom";
import Button from "../button/Button";
import { getFeatureCards } from "../../utils/featureCards";

export const Frontpage: React.FC = () => {
  const navigate = useNavigate();

  const scrollToGrader = () => {
    document.getElementById("grader")?.scrollIntoView({ behavior: "smooth" });
  };

  const featureCards = getFeatureCards({
    scrollToGrader,
    navigate,
  });

  return (
    <div className="frontpage-container">
      <section className="hero">
        <h1>Analyser og samle Pokémon-kort</h1>
        <p>Søk i kortdatabasen, sjekk markedspriser og bygg din portefølje.</p>
        <Button
          variant="primary"
          className="hero__cta"
          onClick={() => navigate("/search")}
        >
          Find a card
        </Button>
      </section>

      <section className="feature-cards">
        <div className="feature-cards__row">
          {featureCards.map((card) => {
            const Icon = card.icon;

            return (
              <button
                key={card.id}
                type="button"
                className="feature-card"
                style={{ "--feature-accent": card.accent } as React.CSSProperties}
                onMouseDown={(e) => e.preventDefault()}
                onClick={card.action}
              >
                <span className="feature-card__icon" aria-hidden="true">
                  <Icon size={22} strokeWidth={2} />
                </span>
                <span className="feature-card__text">
                  <span className="feature-card__title">{card.title}</span>
                  <span className="feature-card__description">
                    {card.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};