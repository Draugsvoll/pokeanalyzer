import React, { useEffect, useState } from "react";
import "./Header.scss";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { Search } from "lucide-react";
import LoginModal from "../loginmodal/Loginmodal";
import Button from "../button/Button";
import { useAuth } from "../../context/authContextValue";
import { db } from "../../firebase";
import { useInitials } from "../../hooks/useInitials";
import { useCredits, useMembershipSubscription } from "../../subscriptions";

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
  const [open, setOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [profileName, setProfileName] = useState<{
    uid: string;
    firstName: string;
  } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const onCardDetail = location.pathname.startsWith("/card/");
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
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        navigate("/search");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <header className={`header${isScrolled ? " header--scrolled" : ""}`}>
      <div className="nav-container">
        <div className="header__left">
          <Link to="/" className="logo" aria-label="Pokélyzer home">
            <span className="logo__mark" aria-hidden="true">
              <svg
                className="logo__mark-svg"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Geometric Pokéball — even stroke, optical center */}
                <circle
                  cx="16"
                  cy="16"
                  r="11.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                />
                <path
                  d="M4.5 16h7.35M20.15 16H27.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
                <circle
                  cx="16"
                  cy="16"
                  r="3.1"
                  stroke="currentColor"
                  strokeWidth="1.75"
                />
                <circle cx="16" cy="16" r="1.05" fill="currentColor" />
              </svg>
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
            Dashboard
          </NavLink>
          <NavLink
            to="/search"
            className={({ isActive }) =>
              `nav-links__item${isActive ? " nav-links__item--active" : ""}`
            }
          >
            Explore
          </NavLink>
          <NavLink
            to="/portfolio"
            className={({ isActive }) =>
              `nav-links__item${isActive ? " nav-links__item--active" : ""}`
            }
          >
            Portfolio
          </NavLink>
          <span
            className={`nav-links__item nav-links__item--static${
              onCardDetail ? " nav-links__item--active" : ""
            }`}
            aria-current={onCardDetail ? "page" : undefined}
          >
            Card detail
          </span>
        </nav>

        <div className="btn-container">
          <button
            type="button"
            className="header__search-btn"
            onClick={() => navigate("/search")}
            aria-label="Search cards"
          >
            <Search size={15} strokeWidth={2} aria-hidden="true" />
            <span>Search cards</span>
            <kbd className="header__kbd">{isMac ? "⌘K" : "Ctrl K"}</kbd>
          </button>

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
            <>
              <Button onClick={() => navigate("/signup")}>Sign up</Button>
              <Button onClick={() => setOpen(true)}>Log in</Button>
            </>
          )}
        </div>
      </div>
      <LoginModal isOpen={open} onClose={() => setOpen(false)} />
    </header>
  );
};
