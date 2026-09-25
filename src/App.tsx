import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import Homepage from "./pages/homepage/Homepage";
import Search from "./pages/search/Search";
import Cardview from "./pages/pokemonDetails/PokemonDetails";
import Profile from "./pages/profile/Profile";
import Portfolio from "./pages/portfolio/Portfolio";
import SignUp from "./pages/signup/Signup";
import NotFound from "./pages/notfound/NotFound";
import Admin from "./pages/admin/Admin";
import PrivacyPolicy from "./pages/legal/PrivacyPolicy";
import TermsOfService from "./pages/legal/TermsOfService";
import DataDisclaimer from "./pages/legal/DataDisclaimer";
import Contact from "./pages/contact/Contact";
import { initializePokeTraceCatalog } from "./services/pokeTraceCatalog";

export default function App() {
  useEffect(() => {
    void initializePokeTraceCatalog();
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Homepage />} />
        <Route path="search" element={<Search />} />
        <Route path="card/:id" element={<Cardview />} />
        <Route path="signup" element={<SignUp />} />
        <Route path="profile" element={<Profile />} />
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="admin" element={<Admin />} />
        <Route path="privacy" element={<PrivacyPolicy />} />
        <Route path="terms" element={<TermsOfService />} />
        <Route path="data-disclaimer" element={<DataDisclaimer />} />
        <Route path="contact" element={<Contact />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
