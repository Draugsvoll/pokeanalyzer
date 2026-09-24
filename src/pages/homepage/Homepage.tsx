import { NewsLane } from "../../components/newslane/Newslane";
import { MarketMoversGrid } from "../../components/marketMoversGrid/MarketMoversGrid";
import { HomeFeatureRow } from "../../components/homeFeatureRow/HomeFeatureRow";
import {
  WelcomeDemoLink,
  WelcomeView,
} from "../../components/welcomeView/WelcomeView";
import { useAuth } from "../../context/authContextValue";
import { dailyTcgNearMintGainers } from "../../services/staticMarketCategories";
import "./Homepage.scss";

export default function Homepage() {
  const { user, loading: authLoading } = useAuth();

  return (
    <div className="page-container homepage">
      <WelcomeView />
      {!authLoading && !user && (
        <div className="homepage__features">
          <div className="homepage__features-action">
            <WelcomeDemoLink />
          </div>
          <HomeFeatureRow />
        </div>
      )}
      <MarketMoversGrid
        changeLabel="Change since the previous daily TCGPlayer Near Mint snapshot"
        loadMovers={dailyTcgNearMintGainers}
        showMarketLabel={false}
        subtitle=""
        title="TCG Daily Gainers"
      />
      <NewsLane />
    </div>
  );
}
