import { Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import Homepage from "./pages/homepage/Homepage";
import Cardview from "./pages/pokemonDetails/PokemonDetails";
import Profile from "./pages/profile/Profile";
import SignUp from "./pages/signup/Signup";
import NotFound from "./pages/notfound/NotFound";
import UserDetails from "./pages/userDetails/UserDetails";
import GrokTester from "./components/grokTester/GrokTester";
import OpenaiTesteer from "./components/openaiTesteer/OpenaiTesteer";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Homepage />} />
        <Route path="card/:id" element={<Cardview />} />
        <Route path="signup" element={<SignUp />} />
        <Route path="profile" element={<Profile />} />
        <Route path="user/:userId" element={<UserDetails />} />
        <Route path="grok-test" element={<GrokTester />} />
        <Route path="openai-test" element={<OpenaiTesteer />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}