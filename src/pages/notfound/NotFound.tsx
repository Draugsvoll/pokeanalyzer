import { Compass, Home, MapPinOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/button/Button";
import "./NotFound.scss";

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <section
      aria-labelledby="not-found-title"
      className="not-found default-container ui-render-fade"
    >
      <span className="not-found__icon" aria-hidden="true">
        <MapPinOff />
      </span>
      <span className="app-subheader">404 · Page not found</span>
      <h1 id="not-found-title">This page isn&apos;t here.</h1>
      <p>
        The address may be outdated, or the page may have moved somewhere else.
      </p>
      <div className="not-found__actions">
        <Button onClick={() => navigate("/")}>
          <Home aria-hidden="true" /> Home
        </Button>
        <Button fill="ghost" onClick={() => navigate("/search")}>
          <Compass aria-hidden="true" /> Explore cards
        </Button>
      </div>
    </section>
  );
};

export default NotFound;
