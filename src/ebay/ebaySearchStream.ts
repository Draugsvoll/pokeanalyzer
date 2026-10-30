import { isEbayListings, type EbaySearchEvent } from "../../shared/ebaySearch";
import { readMarketplaceSearchStream } from "../utils/marketplaceSearchStream";
export function readEbaySearchStream(
  response: Response,
  onEvent: (event: EbaySearchEvent) => void,
) {
  return readMarketplaceSearchStream(response, onEvent, isEbayListings);
}
