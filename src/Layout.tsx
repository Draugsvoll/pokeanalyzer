import { Outlet, useLocation } from "react-router-dom";
import { Header } from "./components/header/Header";

export default function Layout() {
  const location = useLocation();
  const pageKey = location.pathname.split("/").filter(Boolean)[0] ?? "home";

  return (
    <div className="app">
      <Header />

      <main className="main-content">
        <div className="container ui-render-fade" key={pageKey}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
