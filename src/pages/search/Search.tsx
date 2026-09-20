import { DatabaseSearch } from "../../components/databaseSearch/DatabaseSearch";
import { MarketMoversGrid } from "../../components/marketMoversGrid/MarketMoversGrid";
import {
  weeklyGainersTcgNearMint,
  weeklyLosersTcgNearMint,
} from "../../services/marketMoversApi";
import "./Search.scss";

export default function Search() {
  return (
    <div className="search-page">
      <DatabaseSearch autoFocusName />
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
