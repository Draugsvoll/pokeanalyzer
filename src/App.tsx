import { Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import Homepage from "./pages/homepage/Homepage";
import Cardview from "./pages/pokemonDetails/PokemonDetails";
import Profile from "./pages/profile/Profile";
import SignUp from "./pages/signup/Signup";
import NotFound from "./pages/notfound/NotFound";
import CreateListing from './pages/createListing/CreateListing'
import { ListingDetails } from "./components/listingDetails/ListingDetails";
import UserDetails from "./pages/userDetails/UserDetails";
import GrokTester from "./components/grokTester/GrokTester";
import OpenaiTesteer from "./components/openaiTesteer/OpenaiTesteer";
import TestFetch from "./TestFetch";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Homepage />} />
        <Route path="card/:id" element={<Cardview />} />
        <Route path="signup" element={<SignUp />} />
        <Route path="profile" element={<Profile />} />
        <Route path="sell" element={<CreateListing />} />
        <Route path="listing/:id" element={<ListingDetails />} />
        <Route path="user/:userId" element={<UserDetails />} />
        <Route path="grok-test" element={<GrokTester />} />
        <Route path="openai-test" element={<OpenaiTesteer />} />
        <Route path="test-fetch" element={<TestFetch />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
