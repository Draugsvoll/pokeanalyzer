import { DatabaseSearch } from "../../components/databaseSearch/DatabaseSearch";
import { GradingOpportunitiesGrid } from "../../components/gradingOpportunitiesGrid/GradingOpportunitiesGrid";
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
      <GradingOpportunitiesGrid minimized title="Grading Opportunities" />
      <MostSoldGrid minimized title="TCG high volume this week" />
      <MostSoldGrid
        minimized
        loadCards={mostSoldEbayCards}
        title="Ebay high volume this week"
      />
      <MarketMoversGrid
        minimized
        changeLabel="Daily change in the TCGPlayer Near Mint price"
        loadMovers={dailyTcgNearMintLosers}
        showMarketLabel={false}
        subtitle=""
        title="TCG Daily Losers"
      />
      <MarketMoversGrid
        minimized
        changeLabel="Daily change in the TCGPlayer Near Mint price"
        loadMovers={dailyTcgNearMintGainers}
        showMarketLabel={false}
        subtitle=""
        title="TCG Daily Gainers"
      />
    </div>
  );
}
