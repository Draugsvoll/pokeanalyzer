import { useEffect, useState } from "react";
import type { PokemonCard } from "../../../../types/pokemon";
import type { PaidFeatureResponse, UserSubscription } from "../../../../subscriptions/types";
import { authenticatedFetch } from "../../../../utils/authenticatedFetch";
import {
  getVisibleEbayCompResults,
  type EbayCompsResponse,
} from "../../../../utils/ebayComps";
import "./EbaySoldView.scss";
import {
  isAbortError,
  useAbortableRequest,
} from "../../../../hooks/useAbortableRequest";
import { waitForStoredResponse } from "../../../../utils/waitForStoredResponse";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type EbaySoldViewProps = {
  card: PokemonCard;
  onSubscriptionChange?: (subscription: UserSubscription) => void;
};

export default function EbaySoldView({
  card,
  onSubscriptionChange,
}: EbaySoldViewProps) {
  const [response, setResponse] = useState<EbayCompsResponse>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { isCurrentRequest, startRequest } = useAbortableRequest();
  useEffect(() => {
    async function loadSoldListings() {
      const params = new URLSearchParams({ cardId: card.id });
      const signal = startRequest();

      setLoading(true);
      setError("");
      setResponse(null);

      try {
        const res = await authenticatedFetch(`${API_URL}/ebay?${params.toString()}`, {
          signal,
        });
        const data = (await res.json()) as
          Partial<PaidFeatureResponse<EbayCompsResponse>> & {
            error?: string;
            fromDatabase?: boolean;
            message?: string;
          };

        if (!res.ok) {
          throw new Error(
            data?.error ?? data?.message ?? "Failed to fetch eBay sold listings",
          );
        }

        if (!data.subscription) {
          throw new Error("The eBay response did not include subscription data");
        }
        onSubscriptionChange?.(data.subscription);
        if (data.fromDatabase) {
          await waitForStoredResponse(signal);
        }
        if (!signal.aborted) {
          setResponse(data.data);
        }
      } catch (requestError) {
        if (isAbortError(requestError)) return;
        if (!signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Failed to fetch eBay sold listings"
          );
        }
      } finally {
        if (isCurrentRequest(signal)) {
          setLoading(false);
        }
      }
    }

    loadSoldListings();
  }, [card.id, isCurrentRequest, onSubscriptionChange, startRequest]);

  if (loading) return <p>Loading eBay sold listings...</p>;
  if (error) return <p className="card-view__page-error">{error}</p>;

  const results = getVisibleEbayCompResults(response);

  if (!results.length) return <p>No eBay sold listings found.</p>;

  return (
    <div className="ebay-sold-view">
      <h3>eBay sold listings</h3>
      <p className="ebay-sold-view__query">
        {card.name} · {card.set?.name}
      </p>

      <div className="ebay-sold-view__results">
        {results.map((result, index) => (
          <article key={index} className="ebay-sold-view__result">
            {result.thumbnailUrl && <img src={result.thumbnailUrl} alt="" />}
            <dl>
              {result.fields.map((field) => (
                <div key={field.key}>
                  <dt>{field.key}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}
