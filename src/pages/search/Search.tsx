import { DatabaseSearch } from "../../components/databaseSearch/DatabaseSearch";
import { MarketMoversGrid } from "../../components/marketMoversGrid/MarketMoversGrid";
import { MostSoldGrid } from "../../components/mostSoldGrid/MostSoldGrid";
import {
  dailyTcgNearMintGainers,
  dailyTcgNearMintLosers,
  mostSoldEbayCards,
} from "../../services/marketCategoriesApi";
import "./Search.scss";

export default function Search() {
  return (
    <div className="search-page">
      <DatabaseSearch autoFocusName />
      <MostSoldGrid title="Daily Best Sellers on TCGPlayer" />
      <MostSoldGrid
        loadCards={mostSoldEbayCards}
        title="Daily Best Sellers on eBay"
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
