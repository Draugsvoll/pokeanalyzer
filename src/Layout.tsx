import { useLayoutEffect, useRef } from "react";
import { Outlet, useLocation, useNavigationType } from "react-router-dom";
import { Header } from "./components/header/Header";

export default function Layout() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const previousPathRef = useRef<string | null>(null);
  const pageKey = location.pathname.split("/").filter(Boolean)[0] ?? "home";

  useLayoutEffect(() => {
    const previousPath = previousPathRef.current;
    const openedDifferentCard =
      location.pathname.startsWith("/card/") &&
      location.pathname !== previousPath;
    const openedFromVariant =
      navigationType === "PUSH" &&
      location.state !== null &&
      typeof location.state === "object" &&
      "navigationSource" in location.state &&
      location.state.navigationSource === "card-variant";

    if (openedDifferentCard && !openedFromVariant) {
      window.scrollTo({ behavior: "instant", left: 0, top: 0 });
    }

    previousPathRef.current = location.pathname;
  }, [location.pathname, location.state, navigationType]);

  return (
    <div className="app">
      <div className="app-background" aria-hidden="true" />
      <Header />

      <main className="main-content">
        <div className="container ui-render-fade" key={pageKey}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
