import { useLayoutEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Header } from "./components/header/Header";

export default function Layout() {
  const location = useLocation();
  const previousPathRef = useRef<string | null>(null);
  const pageKey = location.pathname.split("/").filter(Boolean)[0] ?? "home";

  useLayoutEffect(() => {
    const previousPath = previousPathRef.current;
    const openedCardRoute =
      location.pathname.startsWith("/card/") &&
      !previousPath?.startsWith("/card/");

    if (openedCardRoute) {
      window.scrollTo({ behavior: "auto", left: 0, top: 0 });
    }

    previousPathRef.current = location.pathname;
  }, [location.pathname]);

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
