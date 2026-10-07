import { lazy, Suspense, type ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import Homepage from "./pages/homepage/Homepage";
import NotFound from "./pages/notfound/NotFound";

const Search = lazy(() => import("./pages/search/Search"));
const SetExplorer = lazy(() => import("./pages/set/Set"));
const Cardview = lazy(() => import("./pages/pokemonDetails/PokemonDetails"));
const SealedDetails = lazy(() => import("./pages/sealedDetails/SealedDetails"));
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
        <div
          aria-busy="true"
          aria-label="Loading"
          aria-live="polite"
          className="route-loading"
          role="status"
        >
          <span aria-hidden="true" className="app-loading-spinner" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Homepage />} />
        <Route path="search" element={withRouteLoader(<Search />)} />
        <Route path="set" element={withRouteLoader(<SetExplorer />)} />
        <Route path="card/:id" element={withRouteLoader(<Cardview />)} />
        <Route
          path="sealed"
          element={withRouteLoader(<Search initialProductType="sealed" />)}
        />
        <Route path="sealed/:id" element={withRouteLoader(<SealedDetails />)} />
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
