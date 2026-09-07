import { DatabaseSearch } from "../../components/databaseSearch/DatabaseSearch";
import { MostExpensiveNewReleases } from "../../components/mostExpensiveNewReleases/MostExpensiveNewReleases";
import "./Search.scss";

export default function Search() {
  return (
    <div className="search-page">
      <DatabaseSearch autoFocusName />
      <MostExpensiveNewReleases />
    </div>
  );
}
