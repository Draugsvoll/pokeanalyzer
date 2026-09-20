import { NewsLane } from "../../components/newslane/Newslane";
import { MarketMoversGrid } from "../../components/marketMoversGrid/MarketMoversGrid";
import { WelcomeView } from "../../components/welcomeView/WelcomeView";
import { weeklyGainersTcgNearMint } from "../../services/marketMoversApi";
import "./Homepage.scss";

export default function Homepage() {
  return (
    <div className="page-container homepage">
      <WelcomeView />
      <MarketMoversGrid
        loadMovers={weeklyGainersTcgNearMint}
        subtitle=""
        title="Weekly Gainers"
      />
      <NewsLane />
    </div>
  );
}
