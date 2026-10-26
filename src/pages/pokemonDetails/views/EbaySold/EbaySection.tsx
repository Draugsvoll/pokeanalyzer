import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CircleDollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { EbayCredits } from "../../../../../shared/ebayCredits";
import type {
  EbayListingStatus,
  EbayListingType,
} from "../../../../../shared/ebaySearch";
import { readEbaySearchStream } from "../../../../ebay/ebaySearchStream";
import LoginModal from "../../../../components/loginmodal/Loginmodal";
import { useAuth } from "../../../../context/authContextValue";
import { useEbayCredits } from "../../../../ebay/useEbayCredits";
import { useAbortableRequest } from "../../../../hooks/useAbortableRequest";
import { authenticatedFetch } from "../../../../utils/authenticatedFetch";
import type { EbayCompsResponse } from "../../../../utils/ebayComps";
import { CardFeatureHeader } from "../../components/CardFeatureHeader";
import { CardFeatureAuthActions } from "../../components/CardFeatureAuthActions";
import EbaySoldView from "./EbaySoldView";
import "./EbaySection.scss";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const EBAY_REQUEST_ERROR =
  "We couldn't load Ebay sales and listings. Please try again.";
const LISTING_STATUS_LABELS = {
  pending: "loading",
  success: "ready",
  error: "failed",
};

type EbaySectionProps = {
  cardId: string;
  cardName: string;
  cardNumber?: string;
  setName?: string;
  isDemo?: boolean;
  demoResponse?: Record<string, unknown>;
  onLoadingChange?: (loading: boolean) => void;
};

// An account or card change creates a fresh section and cancels its old request.
export function EbaySection(props: EbaySectionProps) {
  const { user, loading } = useAuth();

  return (
    <EbaySectionForAccount
      key={`${props.cardId}:${user?.uid ?? "guest"}`}
      {...props}
      userId={user?.uid}
      emailVerified={user?.emailVerified !== false}
      authLoading={loading}
    />
  );
}

function EbaySectionForAccount({
  cardId,
  cardName,
  cardNumber,
  setName,
  isDemo = false,
  demoResponse,
  onLoadingChange,
  userId,
  emailVerified,
  authLoading,
}: EbaySectionProps & {
  userId?: string;
  emailVerified: boolean;
  authLoading: boolean;
}) {
  const navigate = useNavigate();
  const {
    credits,
    error: creditsError,
    refreshCredits,
    updateCredits,
  } = useEbayCredits();
  const [response, setResponse] = useState<EbayCompsResponse>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [listingStates, setListingStates] = useState<
    Record<EbayListingType, EbayListingStatus>
  >({
    sold: "pending",
    active: "pending",
  });
  const [firstListingType, setFirstListingType] =
    useState<EbayListingType>("sold");
  const [showLoginModal, setShowLoginModal] = useState(false);
  const requestPendingRef = useRef(false);
  const { abortActiveRequest, isCurrentRequest, startRequest } =
    useAbortableRequest();

  useLayoutEffect(() => abortActiveRequest, [abortActiveRequest]);

  useEffect(() => {
    onLoadingChange?.(loading);
    return () => onLoadingChange?.(false);
  }, [loading, onLoadingChange]);

  const displayedResponse = isDemo ? (demoResponse ?? null) : response;
  const hasResponse = displayedResponse !== null;
  const hasSoldResponse =
    displayedResponse !== null &&
    typeof displayedResponse === "object" &&
    "sold" in displayedResponse &&
    displayedResponse.sold != null;
  const hasActiveResponse =
    displayedResponse !== null &&
    typeof displayedResponse === "object" &&
    "active" in displayedResponse &&
    displayedResponse.active != null;
  const hasUsableResponse = hasSoldResponse || hasActiveResponse;
  const soldFailed = isDemo
    ? hasResponse && !hasSoldResponse
    : listingStates.sold === "error";
  const activeFailed = isDemo
    ? hasResponse && !hasActiveResponse
    : listingStates.active === "error";
  const failedSides = [soldFailed && "sales", activeFailed && "listings"]
    .filter(Boolean)
    .join(" and ");
  const responseError = failedSides
    ? `We couldn't load Ebay ${failedSides}. Please try again.`
    : "";
  const headerError = error || responseError;
  const noCredits = Boolean(
    userId &&
    !authLoading &&
    credits &&
    !credits.unlimited &&
    credits.creditsRemaining < 1,
  );

  async function searchEbay() {
    if (
      isDemo ||
      !userId ||
      !emailVerified ||
      !credits ||
      (!credits.unlimited && credits.creditsRemaining < 1) ||
      requestPendingRef.current
    ) {
      return;
    }

    requestPendingRef.current = true;
    const signal = startRequest();
    setLoading(true);
    setError("");
    setResponse(null);
    setListingStates({ sold: "pending", active: "pending" });
    let receivedResult = false;

    try {
      const params = new URLSearchParams({ cardId, stream: "1" });
      const res = await authenticatedFetch(
        `${API_URL}/ebay?${params.toString()}`,
        { signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]) },
        userId,
      );
      if (signal.aborted || !isCurrentRequest(signal)) return;

      if (!res.ok) {
        if (res.status === 409) {
          setError("You don't have enough Ebay credits for this search.");
          await refreshCredits();
          return;
        }
        if (res.status === 401) {
          setError("Please log in again to search Ebay.");
          return;
        }
        if (res.status === 403) {
          setError("Please verify your email before searching Ebay.");
          return;
        }
        throw new Error("eBay request failed");
      }
      if (res.headers.get("content-type")?.includes("application/x-ndjson")) {
        await readEbaySearchStream(res, (event) => {
          if (signal.aborted || !isCurrentRequest(signal)) return;
          if (event.type === "started" || event.type === "complete") {
            updateCredits(event.credits);
          } else if (event.type === "result") {
            if (!receivedResult) {
              setFirstListingType(event.side);
              receivedResult = true;
            }
            setResponse((previous: unknown) => ({
              ...(previous && typeof previous === "object" ? previous : {}),
              [event.side]: event.data,
            }));
            setListingStates((previous) => ({
              ...previous,
              [event.side]: "success",
            }));
          } else if (event.type === "failure") {
            setListingStates((previous) => ({
              ...previous,
              [event.side]: "error",
            }));
          }
        });
        return;
      }
      // Older servers still return the complete JSON response.
      const data = (await res.json()) as {
        data?: EbayCompsResponse;
        credits?: EbayCredits;
      };
      if (signal.aborted || !isCurrentRequest(signal)) return;
      if (!data.credits || data.data == null) {
        throw new Error("Incomplete eBay response");
      }

      updateCredits(data.credits);
      setResponse(data.data);
      const result = data.data as { sold?: unknown; active?: unknown };
      setFirstListingType(result.sold != null ? "sold" : "active");
      setListingStates({
        sold: result.sold != null ? "success" : "error",
        active: result.active != null ? "success" : "error",
      });
    } catch {
      if (!signal.aborted && isCurrentRequest(signal)) {
        setError(EBAY_REQUEST_ERROR);
        setListingStates((previous) => ({
          sold: previous.sold === "pending" ? "error" : previous.sold,
          active: previous.active === "pending" ? "error" : previous.active,
        }));
        // A failed provider request can refund a previously reserved credit.
        void refreshCredits();
      }
    } finally {
      if (!signal.aborted && isCurrentRequest(signal)) {
        requestPendingRef.current = false;
        setLoading(false);
      }
    }
  }

  return (
    <section aria-label="Ebay sales and listings" className="ebay-section">
      <p className="ebay-section__announcement" aria-live="polite">
        {!isDemo && hasUsableResponse
          ? `Sold: ${LISTING_STATUS_LABELS[listingStates.sold]}. Listed: ${LISTING_STATUS_LABELS[listingStates.active]}.`
          : ""}
      </p>
      {(!hasUsableResponse || headerError) && (
        <CardFeatureHeader
          card={{
            name: cardName,
            number: cardNumber,
            set: { name: setName },
          }}
          color="teal"
          icon={CircleDollarSign}
          label="Ebay Explorer"
          actionLabel={
            noCredits
              ? "Add credits"
              : credits?.unlimited
                ? "Search Ebay"
                : "1 Ebay credit"
          }
          actionLoading={loading && !headerError}
          actionLoadingLabel="Searching Ebay..."
          actionLoadingMessage="Fetching Ebay listings and sales..."
          errorMessage={headerError}
          actionDisabled={
            loading ||
            (noCredits ? false : authLoading || !emailVerified || !credits)
          }
          actionHidden={isDemo}
          onAction={
            noCredits ? () => navigate("/profile") : () => void searchEbay()
          }
          authActions={
            !isDemo && !userId && !authLoading ? (
              <CardFeatureAuthActions
                color="teal"
                onSignup={() => navigate("/signup")}
                onLogin={() => setShowLoginModal(true)}
              />
            ) : undefined
          }
        >
          {!isDemo && userId && !emailVerified && (
            <p className="ebay-section__notice">
              Please verify your email before searching Ebay.
            </p>
          )}
          {!isDemo && userId && creditsError && (
            <div className="ebay-section__notice" role="alert">
              <span>We couldn't refresh your Ebay credits.</span>
            </div>
          )}
        </CardFeatureHeader>
      )}
      {hasUsableResponse && (
        <div className="ebay-section__results default-container">
          <EbaySoldView
            response={displayedResponse}
            initialListingType={isDemo ? "sold" : firstListingType}
            listingStates={isDemo ? undefined : listingStates}
          />
        </div>
      )}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
    </section>
  );
}
