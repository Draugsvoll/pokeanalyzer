import React, { useEffect, useState } from 'react';
import './Header.scss'
import { Link, useNavigate } from 'react-router-dom';
import LoginModal from '../loginmodal/Loginmodal';
import Button from "../button/Button";
import { useAuth } from "../../context/authContextValue";

export const Header: React.FC = () => {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const updateScrollState = () => setIsScrolled(window.scrollY > 0);

    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });

    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);
  
  return (
   <header className={`header${isScrolled ? " header--scrolled" : ""}`}>
        <div className="nav-container">
          <Link to="/" className="logo">
            <span className="logo__text">PokéAnalyzer</span>
          </Link>
          <div className="nav-links">
            <Link to="/search">Utforsk kort</Link>
          </div>
          <div className="btn-container">
            {user ? (
              <>
              <Link to="/portfolio">
                Min samling
              </Link>
              <Link to="/profile">
                Min Konto
              </Link>
              <Button className="btn" onClick={logout}>
                Logg ut
              </Button>
              </>
            ) : (
              <>
                <Button className="btn" onClick={() => navigate("/signup")}>
                  signup
                </Button>

                <Button className="btn" onClick={() => setOpen(true)}>
                  Logg inn
                </Button>
              </>
            )}
          </div>
        </div>
        <LoginModal
          isOpen={open}
          onClose={() => setOpen(false)}
        />
      </header>
  );
};
