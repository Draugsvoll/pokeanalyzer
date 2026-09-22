import React from "react";
import { Play } from "lucide-react";
import { Link } from "react-router-dom";
import "./WelcomeView.scss";
import { DatabaseSearch } from "../databaseSearch/DatabaseSearch";

export const WelcomeView: React.FC = () => {
  return (
    <div className="welcome-view">
      <DatabaseSearch />
    </div>
  );
};

export const WelcomeDemoLink: React.FC = () => (
  <Link className="welcome-view__demo-link" to="/card/demo">
    <Play size={15} strokeWidth={2} aria-hidden="true" />
    Try the free demo
  </Link>
);
