import { DatabaseSearch } from "../../components/databaseSearch/DatabaseSearch";
import { MarketMoversGrid } from "../../components/marketMoversGrid/MarketMoversGrid";
import { MostSoldGrid } from "../../components/mostSoldGrid/MostSoldGrid";
import {
  weeklyGainersTcgNearMint,
  weeklyLosersTcgNearMint,
} from "../../services/marketMoversApi";
import "./Search.scss";

export default function Search() {
  return (
    <div className="search-page">
      <DatabaseSearch autoFocusName />
      <MostSoldGrid />
      <MarketMoversGrid
        loadMovers={weeklyGainersTcgNearMint}
        subtitle=""
        title="Weekly Gainers"
      />
      <MarketMoversGrid
        loadMovers={weeklyLosersTcgNearMint}
        subtitle=""
        title="Weekly Losers"
      />
    </div>
  );
}
