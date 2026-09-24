import { DatabaseSearch } from "../../components/databaseSearch/DatabaseSearch";
import { MarketMoversGrid } from "../../components/marketMoversGrid/MarketMoversGrid";
import { MostSoldGrid } from "../../components/mostSoldGrid/MostSoldGrid";
import {
  dailyTcgNearMintGainers,
  dailyTcgNearMintLosers,
  mostSoldEbayCards,
} from "../../services/staticMarketCategories";
import "./Search.scss";

export default function Search() {
  return (
    <div className="search-page">
      <DatabaseSearch autoFocusName />
      <MostSoldGrid title="Daily Most Sold on TCGPlayer" />
      <MostSoldGrid
        loadCards={mostSoldEbayCards}
        title="Daily Most Sold on eBay"
      />
      <MarketMoversGrid
        changeLabel="Change since the previous daily TCGPlayer Near Mint snapshot"
        loadMovers={dailyTcgNearMintLosers}
        showMarketLabel={false}
        subtitle=""
        title="TCG Daily Losers"
      />
      <MarketMoversGrid
        changeLabel="Change since the previous daily TCGPlayer Near Mint snapshot"
        loadMovers={dailyTcgNearMintGainers}
        showMarketLabel={false}
        subtitle=""
        title="TCG Daily Gainers"
      />
    </div>
  );
}
