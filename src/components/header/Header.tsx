import React, { useEffect, useState } from 'react';
import './Header.scss'
import { Link, useNavigate } from 'react-router-dom';
import { doc, getDoc } from "firebase/firestore";
import LoginModal from '../loginmodal/Loginmodal';
import Button from "../button/Button";
import { useAuth } from "../../context/authContextValue";
import { db } from "../../firebase";
import { useInitials } from "../../hooks/useInitials";

function formatAccountName(value?: string | null) {
  const name = value?.trim();

  if (!name) return "";

  return name
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export const Header: React.FC = () => {
  const { user } = useAuth()
  const [open, setOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [profileName, setProfileName] = useState<{
    uid: string;
    firstName: string;
  } | null>(null);
  const navigate = useNavigate();
  const savedFirstName = profileName?.uid === user?.uid
    ? profileName?.firstName ?? ""
    : "";
  const accountInitial = useInitials(
    savedFirstName || user?.displayName || user?.email
  );
  const accountLabel =
    formatAccountName(savedFirstName || user?.displayName) ||
    formatAccountName(user?.email?.split("@")[0]) ||
    "Konto";

  useEffect(() => {
    let ignore = false;

    if (!user) return;

    const loadFirstName = async () => {
      try {
        const userSnapshot = await getDoc(doc(db, "users", user.uid));
        const firstName = userSnapshot.data()?.firstName;

        if (!ignore) {
          setProfileName({
            uid: user.uid,
            firstName: typeof firstName === "string" ? firstName : "",
          });
        }
      } catch {
        if (!ignore) setProfileName({ uid: user.uid, firstName: "" });
      }
    };

    void loadFirstName();

    return () => {
      ignore = true;
    };
  }, [user]);

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
            <span className="logo__text">Pokélyzer</span>
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
              <Link to="/profile" className="app-btn app-btn-pill app-btn-pill--account">
                {user.photoURL ? (
                  <img
                    className="app-btn-pill__avatar"
                    src={user.photoURL}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="app-btn-pill__avatar" aria-hidden="true">
                    {accountInitial}
                  </span>
                )}
                <span className="app-btn-pill__label">{accountLabel}</span>
              </Link>
              </>
            ) : (
              <>
                <Button onClick={() => navigate("/signup")}>
                  signup
                </Button>

                <Button onClick={() => setOpen(true)}>
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
