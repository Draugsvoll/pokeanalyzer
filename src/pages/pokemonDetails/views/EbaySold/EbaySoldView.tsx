import { useEffect, useState } from "react";
import type { PokemonCard } from "../../../../types/pokemon";
import {
  getVisibleEbayCompResults,
  type EbayCompsResponse,
} from "../../../../utils/ebayComps";
import "./EbaySoldView.scss";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type EbaySoldViewProps = {
  card: PokemonCard;
};

export default function EbaySoldView({ card }: EbaySoldViewProps) {
  const [response, setResponse] = useState<EbayCompsResponse>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadSoldListings() {
      const query = [card.name, card.set?.name].filter(Boolean).join(" ");
      const params = new URLSearchParams({ q: query });

      setLoading(true);
      setError("");
      setResponse(null);

      try {
        const res = await fetch(`${API_URL}/ebay?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as EbayCompsResponse & { error?: string };

        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to fetch eBay sold listings");
        }

        setResponse(data);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to fetch eBay sold listings"
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadSoldListings();
    return () => controller.abort();
  }, [card.name, card.set?.name]);

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
