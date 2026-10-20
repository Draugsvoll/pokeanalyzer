import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CircleDollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { EbayCredits } from "../../../../../shared/ebayCredits";
import LoginModal from "../../../../components/loginmodal/Loginmodal";
import { useAuth } from "../../../../context/authContextValue";
import { useEbayCredits } from "../../../../ebay/useEbayCredits";
import {
  isAbortError,
  useAbortableRequest,
} from "../../../../hooks/useAbortableRequest";
import { authenticatedFetch } from "../../../../utils/authenticatedFetch";
import type { EbayCompsResponse } from "../../../../utils/ebayComps";
import { CardFeatureHeader } from "../../components/CardFeatureHeader";
import { CardFeatureAuthActions } from "../../components/CardFeatureAuthActions";
import EbaySoldView from "./EbaySoldView";
import "./EbaySection.scss";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const EBAY_REQUEST_ERROR =
  "We couldn't load eBay sales and listings. Please try again.";

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
  const hasCompleteResponse = hasSoldResponse && hasActiveResponse;
  const responseError =
    hasResponse && !hasCompleteResponse
      ? `We couldn't load eBay ${hasSoldResponse ? "listings" : hasActiveResponse ? "sales" : "sales and listings"}. Please try again.`
      : "";
  const noCredits = Boolean(
    userId && !authLoading && credits && credits.creditsRemaining < 1,
  );

  async function searchEbay() {
    if (
      isDemo ||
      !userId ||
      !emailVerified ||
      !credits ||
      credits.creditsRemaining < 1 ||
      requestPendingRef.current
    ) {
      return;
    }

    requestPendingRef.current = true;
    const signal = startRequest();
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ cardId });
      const res = await authenticatedFetch(
        `${API_URL}/ebay?${params.toString()}`,
        { signal },
        userId,
      );
      const data = (await res.json()) as {
        data?: EbayCompsResponse;
        credits?: EbayCredits;
      };
      if (signal.aborted || !isCurrentRequest(signal)) return;

      if (!res.ok) {
        if (res.status === 409) {
          setError("You don't have enough eBay credits for this search.");
          await refreshCredits();
          return;
        }
        if (res.status === 401) {
          setError("Please log in again to search eBay.");
          return;
        }
        if (res.status === 403) {
          setError("Please verify your email before searching eBay.");
          return;
        }
        throw new Error("eBay request failed");
      }
      if (!data.credits || data.data == null) {
        throw new Error("Incomplete eBay response");
      }

      updateCredits(data.credits);
      setResponse(data.data);
    } catch (requestError) {
      if (
        !isAbortError(requestError) &&
        !signal.aborted &&
        isCurrentRequest(signal)
      ) {
        setError(EBAY_REQUEST_ERROR);
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
    <section aria-label="eBay sales and listings" className="ebay-section">
      {!hasCompleteResponse && (
        <CardFeatureHeader
          card={{
            name: cardName,
            number: cardNumber,
            set: { name: setName },
          }}
          color="teal"
          icon={CircleDollarSign}
          label="eBay Comps"
          actionLabel={noCredits ? "Add credits" : "1 eBay credit"}
          actionLoading={loading}
          actionLoadingLabel="Searching eBay..."
          actionLoadingMessage="Loading eBay listings and sales..."
          errorMessage={error || responseError}
          actionDisabled={
            noCredits ? false : authLoading || !emailVerified || !credits
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
              Please verify your email before searching eBay.
            </p>
          )}
          {!isDemo && userId && creditsError && (
            <div className="ebay-section__notice" role="alert">
              <span>We couldn't refresh your eBay credits.</span>
            </div>
          )}
        </CardFeatureHeader>
      )}
      {hasResponse && (
        <div className="ebay-section__results default-container">
          <EbaySoldView response={displayedResponse} />
        </div>
      )}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
    </section>
  );
}
