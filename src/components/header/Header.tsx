import React, { useEffect, useState } from "react";
import "./Header.scss";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import LoginModal from "../loginmodal/Loginmodal";
import Button from "../button/Button";
import { useAuth } from "../../context/authContextValue";
import { db } from "../../firebase";
import { useInitials } from "../../hooks/useInitials";
import { useCredits, useMembershipSubscription } from "../../subscriptions";
import { BrandMark } from "../brand/BrandMark";

function formatAccountName(value?: string | null) {
  const name = value?.trim();
  if (!name) return "";
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export const Header: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [mobileNavState, setMobileNavState] = useState({
    open: false,
    pathname: location.pathname,
  });
  const [isScrolled, setIsScrolled] = useState(false);
  const [profileName, setProfileName] = useState<{
    uid: string;
    firstName: string;
  } | null>(null);
  const mobileNavOpen =
    mobileNavState.open && mobileNavState.pathname === location.pathname;
  const closeMobileNav = () =>
    setMobileNavState({ open: false, pathname: location.pathname });
  const { subscription } = useMembershipSubscription();
  const { creditsRemaining } = useCredits(subscription);

  const savedFirstName =
    profileName?.uid === user?.uid ? (profileName?.firstName ?? "") : "";
  const accountInitial = useInitials(
    savedFirstName || user?.displayName || user?.email,
  );
  const accountLabel =
    formatAccountName(savedFirstName || user?.displayName) ||
    formatAccountName(user?.email?.split("@")[0]) ||
    "Account";

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
    const updateScrollState = () => setIsScrolled(window.scrollY > 4);
    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavState({ open: false, pathname: location.pathname });
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [location.pathname, mobileNavOpen]);

  return (
    <header className={`header${isScrolled ? " header--scrolled" : ""}`}>
      <div className="nav-container">
        <div className="header__left">
          <Link to="/" className="logo" aria-label="Pokélyzer home">
            <span className="logo__mark" aria-hidden="true">
              <BrandMark className="logo__mark-svg" />
            </span>
            <span className="logo__text">Pokélyzer</span>
          </Link>
        </div>

        <nav className="nav-links" aria-label="Main">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `nav-links__item${isActive ? " nav-links__item--active" : ""}`
            }
          >
            Home
          </NavLink>
          <NavLink
            to="/search"
            className={({ isActive }) =>
              `nav-links__item${isActive ? " nav-links__item--active" : ""}`
            }
          >
            Cards
          </NavLink>
          <NavLink
            to="/set"
            className={({ isActive }) =>
              `nav-links__item${isActive ? " nav-links__item--active" : ""}`
            }
          >
            Sets
          </NavLink>
          <NavLink
            to="/portfolio"
            className={({ isActive }) =>
              `nav-links__item${isActive ? " nav-links__item--active" : ""}`
            }
          >
            Portfolio
          </NavLink>
        </nav>

        <div className="btn-container">
          {user ? (
            <>
              <Link
                to="/profile"
                className="header__credits"
                title="Credits remaining"
              >
                <span className="header__credits-dot" aria-hidden="true" />
                <span>{creditsRemaining} credits</span>
              </Link>
              <Link
                to="/profile"
                className="header__avatar-link"
                aria-label={accountLabel}
                title={accountLabel}
              >
                <span className="avatar-initials header__avatar">
                  {accountInitial}
                </span>
              </Link>
            </>
          ) : (
            <div className="header__guest-actions">
              <span className="header__signup-action">
                <Button
                  fill="ghost"
                  size="medium"
                  onClick={() => navigate("/signup")}
                >
                  Sign up
                </Button>
              </span>
              <Button fill="ghost" size="medium" onClick={() => setOpen(true)}>
                Log in
              </Button>
            </div>
          )}
          <button
            aria-controls="header-mobile-navigation"
            aria-expanded={mobileNavOpen}
            aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
            className="header__menu-toggle"
            onClick={() =>
              setMobileNavState({
                open: !mobileNavOpen,
                pathname: location.pathname,
              })
            }
            type="button"
          >
            {mobileNavOpen ? (
              <X aria-hidden="true" />
            ) : (
              <Menu aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      {mobileNavOpen && (
        <div className="header__mobile-panel" id="header-mobile-navigation">
          <nav aria-label="Mobile" className="header__mobile-nav">
            <NavLink to="/" end onClick={closeMobileNav}>
              Home
            </NavLink>
            <NavLink to="/search" onClick={closeMobileNav}>
              Cards
            </NavLink>
            <NavLink to="/set" onClick={closeMobileNav}>
              Explore sets
            </NavLink>
            <NavLink to="/portfolio" onClick={closeMobileNav}>
              Portfolio
            </NavLink>
            <NavLink
              to={user ? "/profile" : "/signup"}
              onClick={closeMobileNav}
            >
              {user ? "Account" : "Create account"}
            </NavLink>
          </nav>
        </div>
      )}
      <LoginModal isOpen={open} onClose={() => setOpen(false)} />
    </header>
  );
};
