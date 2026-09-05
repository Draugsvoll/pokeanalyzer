import { DatabaseSearch } from "../../components/databaseSearch/DatabaseSearch";
import "./Search.scss";

export default function Search() {
  return (
    <div className="search-page">
      <DatabaseSearch autoFocusName />
    </div>
  );
}
