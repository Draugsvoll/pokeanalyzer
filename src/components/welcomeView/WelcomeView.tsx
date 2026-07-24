import React from "react";
import "./WelcomeView.scss";
import { useNavigate } from "react-router-dom";
import Button from "../button/Button";
import { INFO_CARDS } from "../../data/infoCards";
import { getCustomColors } from "../../utils/customStylings";

export const WelcomeView: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="welcome-view">
      <section className="hero">
        <h1>Analyser og samle Pokémon-kort</h1>
        <p>Søk i kortdatabasen, sjekk markedspriser og bygg din portefølje.</p>
        <div className="hero__cta-wrap">
          <Button variant="hero" size="large" onClick={() => navigate("/search")}>
            Find a card
          </Button>
        </div>
      </section>

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
    </div>
  );
};
