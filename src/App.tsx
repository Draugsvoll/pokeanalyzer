import { Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import Homepage from "./pages/homepage/Homepage";
import Search from "./pages/search/Search";
import Cardview from "./pages/pokemonDetails/PokemonDetails";
import Profile from "./pages/profile/Profile";
import SignUp from "./pages/signup/Signup";
import NotFound from "./pages/notfound/NotFound";
import GrokTester from "./components/grokTester/GrokTester";
import OpenaiTesteer from "./components/openaiTesteer/OpenaiTesteer";
import CardGrader from "./pages/UploadCard/UploadCardPage";

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h1>{title}</h1>
      <p style={{ color: "var(--muted)", marginTop: "0.75rem" }}>Kommer snart.</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Homepage />} />
        <Route path="search" element={<Search />} />
        <Route path="card/:id" element={<Cardview />} />
        <Route path="signup" element={<SignUp />} />
        <Route path="profile" element={<Profile />} />
        <Route path="grok-test" element={<GrokTester />} />
        <Route path="uploadcard" element={<CardGrader />} />

        {/* <Route path="news" element={<PlaceholderPage title="Nyheter" />} /> */}
        {/* <Route path="openai-test" element={<OpenaiTesteer />} /> */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
