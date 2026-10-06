import { useLayoutEffect, useRef } from "react";
import { Outlet, useLocation, useNavigationType } from "react-router-dom";
import { Header } from "./components/header/Header";
import { Footer } from "./components/footer/Footer";
import { SITE_NAME } from "./config/site";

const PAGE_TITLES: Record<string, string> = {
  admin: "Admin",
  card: "Card details",
  contact: "Contact",
  "data-disclaimer": "Data disclaimer",
  portfolio: "Portfolio",
  privacy: "Privacy",
  profile: "Account",
  search: "Explore cards",
  sealed: "Explore sealed products",
  set: "Set explorer",
  signup: "Create account",
  terms: "Terms",
};

export default function Layout() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const previousPathRef = useRef<string | null>(null);
  const scrollPositionsRef = useRef(new Map<string, number>());
  const pageKey = location.pathname.split("/").filter(Boolean)[0] ?? "home";

  useLayoutEffect(() => {
    const scrollPositions = scrollPositionsRef.current;
    const previousPath = previousPathRef.current;
    const openedDifferentPage = location.pathname !== previousPath;
    const openedFromVariant =
      navigationType === "PUSH" &&
      location.state !== null &&
      typeof location.state === "object" &&
      "navigationSource" in location.state &&
      location.state.navigationSource === "card-variant";

    if (openedDifferentPage && !openedFromVariant) {
      const savedScrollPosition =
        navigationType === "POP"
          ? scrollPositions.get(location.key)
          : undefined;
      window.scrollTo({
        behavior: "instant",
        left: 0,
        top: savedScrollPosition ?? 0,
      });
    }

    previousPathRef.current = location.pathname;
    return () => {
      scrollPositions.set(location.key, window.scrollY);
    };
  }, [location.key, location.pathname, location.state, navigationType]);

  useLayoutEffect(() => {
    const pageTitle = PAGE_TITLES[pageKey];
    document.title = pageTitle
      ? `${pageTitle} | ${SITE_NAME}`
      : location.pathname === "/"
        ? `${SITE_NAME} | Pokémon card prices and collection insights`
        : `Page not found | ${SITE_NAME}`;
  }, [location.pathname, pageKey]);

  return (
    <div className="app">
      <div className="app-background" aria-hidden="true" />
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Header />

      <main className="main-content" id="main-content" tabIndex={-1}>
        <div className="container ui-render-fade" key={pageKey}>
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  );
}
