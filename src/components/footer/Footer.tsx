import { Link } from "react-router-dom";
import { BrandMark } from "../brand/BrandMark";
import { SITE_NAME } from "../../config/site";
import "./Footer.scss";

const productLinks = [
  { label: "Explore cards", to: "/search" },
  { label: "Portfolio", to: "/portfolio" },
  { label: "Free demo", to: "/card/demo" },
  { label: "Account", to: "/profile" },
];

const legalLinks = [
  { label: "Privacy", to: "/privacy" },
  { label: "Terms", to: "/terms" },
];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__shell">
        <div className="site-footer__primary">
          <div className="site-footer__brand-column">
            <Link
              aria-label={`${SITE_NAME} home`}
              className="site-footer__brand"
              to="/"
            >
              <span className="site-footer__brand-mark">
                <BrandMark className="site-footer__brand-svg" />
              </span>
              <span>{SITE_NAME}</span>
            </Link>
            <p className="site-footer__summary">
              Pokémon card prices, market activity, and collection insights in
              one place.
            </p>
          </div>

          <nav aria-label="Footer" className="site-footer__navigation">
            <section className="site-footer__link-group">
              <h2>Product</h2>
              {productLinks.map((link) => (
                <Link key={link.to} to={link.to}>
                  {link.label}
                </Link>
              ))}
            </section>

            <section className="site-footer__link-group">
              <h2>Company</h2>
              <Link to="/contact">Contact Us</Link>
            </section>

            <section className="site-footer__link-group">
              <h2>Legal</h2>
              {legalLinks.map((link) => (
                <Link key={link.to} to={link.to}>
                  {link.label}
                </Link>
              ))}
            </section>
          </nav>
        </div>

        <div className="site-footer__bottom">
          <small>
            © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
          </small>
          <small className="site-footer__legal-note">
            Pokémon and related trademarks are the property of their respective
            owners. {SITE_NAME} is not affiliated with or endorsed by Nintendo,
            Creatures Inc., GAME FREAK inc., or The Pokémon Company
            International.
          </small>
        </div>
      </div>
    </footer>
  );
}
