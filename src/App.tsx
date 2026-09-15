import { Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import Homepage from "./pages/homepage/Homepage";
import Search from "./pages/search/Search";
import PkmnPricesSearch from "./pages/search/PkmnPricesSearch";
import PokeTraceSearch from "./pages/search/PokeTraceSearch";
import Cardview from "./pages/pokemonDetails/PokemonDetails";
import Profile from "./pages/profile/Profile";
import Portfolio from "./pages/portfolio/Portfolio";
import SignUp from "./pages/signup/Signup";
import NotFound from "./pages/notfound/NotFound";
import Admin from "./pages/admin/Admin";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Homepage />} />
        <Route path="search" element={<Search />} />
        <Route path="pkmn-search" element={<PkmnPricesSearch />} />
        <Route path="poketrace-search" element={<PokeTraceSearch />} />
        <Route path="card/:id" element={<Cardview />} />
        <Route path="signup" element={<SignUp />} />
        <Route path="profile" element={<Profile />} />
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="admin" element={<Admin />} />
        {/* <Route path="uploadcard" element={<CardGrader />} /> */}

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
