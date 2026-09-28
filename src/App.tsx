import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import Homepage from "./pages/homepage/Homepage";
import NotFound from "./pages/notfound/NotFound";
import { initializePokeTraceCatalog } from "./services/pokeTraceCatalog";
import { LoadingState } from "./components/loadingState/LoadingState";

const Search = lazy(() => import("./pages/search/Search"));
const Cardview = lazy(() => import("./pages/pokemonDetails/PokemonDetails"));
const Profile = lazy(() => import("./pages/profile/Profile"));
const Portfolio = lazy(() => import("./pages/portfolio/Portfolio"));
const SignUp = lazy(() => import("./pages/signup/Signup"));
const Admin = lazy(() => import("./pages/admin/Admin"));
const PrivacyPolicy = lazy(() => import("./pages/legal/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/legal/TermsOfService"));
const DataDisclaimer = lazy(() => import("./pages/legal/DataDisclaimer"));
const Contact = lazy(() => import("./pages/contact/Contact"));

function withRouteLoader(children: ReactNode) {
  return (
    <Suspense
      fallback={
        <div className="route-loading" aria-busy="true">
          <LoadingState>Loading page</LoadingState>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

export default function App() {
  useEffect(() => {
    void initializePokeTraceCatalog();
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Homepage />} />
        <Route path="search" element={withRouteLoader(<Search />)} />
        <Route path="card/:id" element={withRouteLoader(<Cardview />)} />
        <Route path="signup" element={withRouteLoader(<SignUp />)} />
        <Route path="profile" element={withRouteLoader(<Profile />)} />
        <Route path="portfolio" element={withRouteLoader(<Portfolio />)} />
        <Route path="admin" element={withRouteLoader(<Admin />)} />
        <Route path="privacy" element={withRouteLoader(<PrivacyPolicy />)} />
        <Route path="terms" element={withRouteLoader(<TermsOfService />)} />
        <Route
          path="data-disclaimer"
          element={withRouteLoader(<DataDisclaimer />)}
        />
        <Route path="contact" element={withRouteLoader(<Contact />)} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
