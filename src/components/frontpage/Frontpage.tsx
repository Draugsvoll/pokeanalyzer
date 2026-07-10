import React from "react";
import "./Frontpage.scss";
import { useNavigate } from "react-router-dom";
import Button from "../button/Button";
import { getInfoCards } from "../../utils/infoCard";
import { getFeatureStyles } from "../../utils/featureStylings";

export const Frontpage: React.FC = () => {
  const navigate = useNavigate();

  const scrollToGrader = () => {
    document.getElementById("grader")?.scrollIntoView({ behavior: "smooth" });
  };

  const infoCards = getInfoCards({
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

      <section className="info-cards">
        <div className="info-cards__row">
          {infoCards.map((infoCard) => {
            const Icon = infoCard.icon;

            return (
              <button
                key={infoCard.id}
                type="button"
                className="info-card"
                style={getFeatureStyles(infoCard.color)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={infoCard.action}
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
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
