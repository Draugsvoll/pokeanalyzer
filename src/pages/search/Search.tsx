import { DatabaseSearch } from "../../components/databaseSearch/DatabaseSearch";
import { MarketMoversGrid } from "../../components/marketMoversGrid/MarketMoversGrid";
import { MostSoldGrid } from "../../components/mostSoldGrid/MostSoldGrid";
import {
  dailyTcgNearMintGainers,
  dailyTcgNearMintLosers,
  mostSoldEbayCards,
} from "../../services/marketCategoriesApi";
import type { ProductType } from "../../components/productTypeSwitch/ProductTypeSwitch";
import "./Search.scss";

export default function Search({
  initialProductType = "singles",
}: {
  initialProductType?: ProductType;
}) {
  return (
    <div className="search-page">
      <DatabaseSearch autoFocusName initialProductType={initialProductType} />
      <MostSoldGrid title="TCG Most Sold Daily" />
      <MostSoldGrid
        loadCards={mostSoldEbayCards}
        title="eBay Most Sold Daily"
      />
      <MarketMoversGrid
        changeLabel="Daily change in the TCGPlayer Near Mint price"
        loadMovers={dailyTcgNearMintLosers}
        showMarketLabel={false}
        subtitle=""
        title="TCG Daily Losers"
      />
      <MarketMoversGrid
        changeLabel="Daily change in the TCGPlayer Near Mint price"
        loadMovers={dailyTcgNearMintGainers}
        showMarketLabel={false}
        subtitle=""
        title="TCG Daily Gainers"
      />
    </div>
  );
}
