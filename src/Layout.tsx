import { Outlet } from "react-router-dom";
import { Header } from "./components/header/Header";

export default function Layout() {
  return (
    <div className="app">
      <Header />

      <main className="main-content">
        <div className="container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}