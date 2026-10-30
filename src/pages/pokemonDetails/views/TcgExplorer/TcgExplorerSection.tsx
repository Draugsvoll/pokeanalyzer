import type {
  MarketplaceSide,
  MarketplaceStatus,
} from "../../../../../shared/marketplaceSearch";
import { readMarketplaceSearchStream } from "../../../../utils/marketplaceSearchStream";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Layers3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/authContextValue";
import { useEbayCredits } from "../../../../ebay/useEbayCredits";
import { useAbortableRequest } from "../../../../hooks/useAbortableRequest";
import { authenticatedFetch } from "../../../../utils/authenticatedFetch";
import LoginModal from "../../../../components/loginmodal/Loginmodal";
import { CardFeatureHeader } from "../../components/CardFeatureHeader";
import { CardFeatureAuthActions } from "../../components/CardFeatureAuthActions";
import {
  isRecord,
  isTcgSnapshot,
  type TcgSnapshot,
} from "../../../../../shared/tcgExplorer";
import { parseEbayCredits } from "../../../../ebay/ebayCreditsApi";
import { TcgExplorerView } from "./TcgExplorerView";
import "./TcgExplorer.scss";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const TCG_REQUEST_ERROR =
  "We couldn't load TCGplayer results. Please try again.";
type Props = {
  cardId: string;
  cardName: string;
  cardNumber?: string;
  setName?: string;
  printing?: string;
  isDemo?: boolean;
  demoResponse?: TcgSnapshot;
  onLoadingChange?: (loading: boolean) => void;
};
export function TcgExplorerSection(props: Props) {
  const { user, loading } = useAuth();
  return (
    <TcgExplorerForAccount
      key={`${props.cardId}:${user?.uid ?? "guest"}:${user?.emailVerified}`}
      {...props}
      userId={user?.uid}
      emailVerified={user?.emailVerified === true}
      authLoading={loading}
    />
  );
}
function TcgExplorerForAccount({
  cardId,
  cardName,
  cardNumber,
  setName,
  isDemo,
  demoResponse,
  onLoadingChange,
  userId,
  emailVerified,
  authLoading,
}: Props & { userId?: string; emailVerified: boolean; authLoading: boolean }) {
  const navigate = useNavigate();
  const { credits, updateCredits, refreshCredits } = useEbayCredits();
  const [data, setData] = useState<TcgSnapshot | null>(null);
  const [listingStates, setListingStates] = useState<
    Record<MarketplaceSide, MarketplaceStatus>
  >({ sold: "pending", active: "pending" });
  const [firstSide, setFirstSide] = useState<MarketplaceSide>("sold");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  const pending = useRef(false);
  const { startRequest, isCurrentRequest, abortActiveRequest } =
    useAbortableRequest();
  useLayoutEffect(() => abortActiveRequest, [abortActiveRequest]);
  useEffect(() => {
    onLoadingChange?.(loading);
    return () => onLoadingChange?.(false);
  }, [loading, onLoadingChange]);
  const noCredits =
    credits && !credits.unlimited && credits.creditsRemaining < 1;

  const displayedData = isDemo
    ? isTcgSnapshot(demoResponse)
      ? demoResponse
      : null
    : data;
  const displayedStates: Record<MarketplaceSide, MarketplaceStatus> = isDemo
    ? {
        sold: displayedData?.sales != null ? "success" : "error",
        active: displayedData?.offers != null ? "success" : "error",
      }
    : listingStates;
  const hasResults =
    displayedData !== null &&
    (displayedData.sales !== null || displayedData.offers !== null);
  const failedSides = [
    hasResults && displayedStates.sold === "error" && "sales",
    hasResults && displayedStates.active === "error" && "listings",
  ]
    .filter(Boolean)
    .join(" and ");
  const headerError =
    error ||
    (failedSides
      ? `We couldn't load TCG ${failedSides}. Please try again.`
      : "");

  async function search() {
    if (
      !userId ||
      !emailVerified ||
      !credits ||
      noCredits ||
      pending.current ||
      isDemo
    )
      return;
    pending.current = true;
    const signal = startRequest();
    setLoading(true);
    setError("");
    setData(null);
    setListingStates({ sold: "pending", active: "pending" });
    let receivedResult = false;
    try {
      const response = await authenticatedFetch(
        `${API_URL}/tcg?stream=1`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cardId,
            condition: "all",
            language: "English",
          }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]),
        },
        userId,
      );
      if (signal.aborted || !isCurrentRequest(signal)) return;
      if (!response.ok) {
        if (response.status === 409) {
          setError("You don't have enough Market credits for this search.");
          await refreshCredits();
          return;
        }
        if (response.status === 401) {
          setError("Please log in again to search TCGplayer.");
          return;
        }
        if (response.status === 403) {
          setError("Please verify your email before searching TCGplayer.");
          return;
        }
        throw new Error("TCG request failed");
      }
      if (
        response.headers.get("content-type")?.includes("application/x-ndjson")
      ) {
        await readMarketplaceSearchStream<TcgSnapshot>(
          response,
          (event) => {
            if (signal.aborted || !isCurrentRequest(signal)) return;
            if (event.type === "started" || event.type === "complete")
              updateCredits(event.credits);
            else if (event.type === "result") {
              if (!receivedResult) {
                setFirstSide(event.side);
                receivedResult = true;
              }
              setData((previous) => ({
                ...event.data,
                sales:
                  event.side === "sold"
                    ? event.data.sales
                    : (previous?.sales ?? null),
                offers:
                  event.side === "active"
                    ? event.data.offers
                    : (previous?.offers ?? null),
                offersMatched:
                  event.side === "active"
                    ? event.data.offersMatched
                    : (previous?.offersMatched ?? false),
              }));
              setListingStates((previous) => ({
                ...previous,
                [event.side]: "success",
              }));
            } else if (event.type === "failure")
              setListingStates((previous) => ({
                ...previous,
                [event.side]: "error",
              }));
          },
          (value, side): value is TcgSnapshot =>
            isTcgSnapshot(value) &&
            (side === "sold"
              ? value.sales !== null
              : value.offers !== null && value.offersMatched),
        );
        return;
      }
      const payload: unknown = await response.json();
      if (signal.aborted || !isCurrentRequest(signal)) return;
      if (!isRecord(payload) || !isTcgSnapshot(payload.data))
        throw new Error("TCGplayer returned invalid results.");
      updateCredits(parseEbayCredits(payload.credits));
      setData(payload.data);
      setFirstSide(payload.data.sales !== null ? "sold" : "active");
      setListingStates({
        sold: payload.data.sales !== null ? "success" : "error",
        active: payload.data.offers !== null ? "success" : "error",
      });
    } catch {
      if (!signal.aborted && isCurrentRequest(signal)) {
        setError(TCG_REQUEST_ERROR);
        setListingStates((previous) => ({
          sold: previous.sold === "pending" ? "error" : previous.sold,
          active: previous.active === "pending" ? "error" : previous.active,
        }));
        void refreshCredits();
      }
    } finally {
      if (!signal.aborted && isCurrentRequest(signal)) {
        pending.current = false;
        setLoading(false);
      }
    }
  }

  return (
    <section className="tcg-explorer" aria-label="Available on TCG">
      {(!hasResults || headerError) && (
        <CardFeatureHeader
          card={{ name: cardName, number: cardNumber, set: { name: setName } }}
          color="orange"
          icon={Layers3}
          label="Available on TCG"
          actionLabel={
            noCredits
              ? "Add credits"
              : credits?.unlimited
                ? "Search TCGplayer"
                : "1 Market credit"
          }
          actionLoading={loading && !headerError}
          actionLoadingLabel="Loading..."
          actionLoadingMessage="Loading listings and sales..."
          actionDisabled={
            loading ||
            (!noCredits && (authLoading || !emailVerified || !credits))
          }
          actionHidden={isDemo}
          onAction={
            noCredits ? () => navigate("/profile") : () => void search()
          }
          errorMessage={headerError}
          description={
            isDemo && !hasResults
              ? "This demo has no saved TCGplayer results."
              : userId && !emailVerified
                ? "Please verify your email before searching TCGplayer."
                : undefined
          }
          authActions={
            !userId && !authLoading && !isDemo ? (
              <CardFeatureAuthActions
                color="orange"
                onSignup={() => navigate("/signup")}
                onLogin={() => setLogin(true)}
              />
            ) : undefined
          }
        >
        </CardFeatureHeader>
      )}
      {hasResults && displayedData && (
        <div className="tcg-explorer__results default-container">
          <TcgExplorerView
            data={displayedData}
            initialSide={
              isDemo
                ? displayedData.sales !== null
                  ? "sold"
                  : "active"
                : firstSide
            }
            listingStates={displayedStates}
          />
        </div>
      )}
      <LoginModal isOpen={login} onClose={() => setLogin(false)} />
    </section>
  );
}
