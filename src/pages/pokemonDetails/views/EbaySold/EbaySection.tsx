import { RadioButtonGroup } from "../../../../components/radioButtonGroup/RadioButtonGroup";
import { useMarketplaceRateLimit } from "../../../../hooks/useMarketplaceRateLimit";
import { MARKETPLACE_RATE_LIMIT_MESSAGE } from "../../../../../shared/marketplaceSearch";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Gavel } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { EbayCredits } from "../../../../../shared/ebayCredits";
import type {
  EbayListingStatus,
  EbayListingType,
  EbayMode,
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

type SearchState = {
  response: EbayCompsResponse;
  error: string;
  listingStates: Record<EbayListingType, EbayListingStatus>;
  firstListingType: EbayListingType;
};
function initialSearchState(): SearchState {
  return {
    response: null,
    error: "",
    listingStates: { sold: "pending", active: "pending" },
    firstListingType: "sold",
  };
}

type EbaySectionProps = {
  cardId: string;
  cardName: string;
  cardNumber?: string;
  setName?: string;
  isDemo?: boolean;
  demoResponse?: Record<string, unknown>;
  demoRawResponse?: Record<string, unknown>;
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

const EbaySectionForAccount = memo(function EbaySectionForAccount({
  cardId,
  cardName,
  cardNumber,
  setName,
  isDemo = false,
  demoResponse,
  demoRawResponse,
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
  const { credits, refreshCredits, updateCredits } = useEbayCredits();
  const [mode, setMode] = useState<EbayMode>("graded");
  const sectionRef = useRef<HTMLElement>(null);
  const restoreModeFocus = useRef(false);

  useLayoutEffect(() => {
    if (!restoreModeFocus.current) return;
    restoreModeFocus.current = false;
    sectionRef.current
      ?.querySelector<HTMLInputElement>(".ebay-section__mode input:checked")
      ?.focus({ preventScroll: true });
  }, [mode]);
  const [searches, setSearches] = useState<Record<EbayMode, SearchState>>(
    () => ({
      raw: initialSearchState(),
      graded: initialSearchState(),
    }),
  );
  const { response, error, listingStates } = searches[mode];
  const [loadingMode, setLoadingMode] = useState<EbayMode | null>(null);
  const loading = loadingMode !== null;
  const [rateLimited, setRateLimited] = useMarketplaceRateLimit();
  function updateSearch(
    update:
      Partial<SearchState> | ((previous: SearchState) => Partial<SearchState>),
  ) {
    setSearches((previous) => ({
      ...previous,
      [mode]: {
        ...previous[mode],
        ...(typeof update === "function" ? update(previous[mode]) : update),
      },
    }));
  }
  const [showLoginModal, setShowLoginModal] = useState(false);
  const requestPendingRef = useRef(false);
  const { abortActiveRequest, isCurrentRequest, startRequest } =
    useAbortableRequest();

  useLayoutEffect(() => abortActiveRequest, [abortActiveRequest]);

  useEffect(() => {
    onLoadingChange?.(loading);
    return () => onLoadingChange?.(false);
  }, [loading, onLoadingChange]);

  const demoResponses = { raw: demoRawResponse, graded: demoResponse };
  const displayedResponse = isDemo ? (demoResponses[mode] ?? null) : response;
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
      requestPendingRef.current ||
      rateLimited
    ) {
      return;
    }

    requestPendingRef.current = true;
    const signal = startRequest();
    setLoadingMode(mode);
    updateSearch({
      error: "",
      response: null,
      listingStates: { sold: "pending", active: "pending" },
    });
    let receivedResult = false;
    let providerRateLimited = false;

    try {
      const params = new URLSearchParams({ cardId, mode, stream: "1" });
      const res = await authenticatedFetch(
        `${API_URL}/ebay?${params.toString()}`,
        { signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]) },
        userId,
      );
      if (signal.aborted || !isCurrentRequest(signal)) return;

      if (!res.ok) {
        if (res.status === 409) {
          updateSearch({
            error: "You don't have enough Market credits for this search.",
          });
          await refreshCredits();
          return;
        }
        if (res.status === 401) {
          updateSearch({ error: "Please log in again to search Ebay." });
          return;
        }
        if (res.status === 403) {
          updateSearch({
            error: "Please verify your email before searching Ebay.",
          });
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
            const first = !receivedResult;
            receivedResult = true;
            updateSearch((previous) => ({
              response: {
                ...(previous.response && typeof previous.response === "object"
                  ? previous.response
                  : {}),
                [event.side]: event.data,
              },
              listingStates: {
                ...previous.listingStates,
                [event.side]: "success",
              },
              ...(first ? { firstListingType: event.side } : {}),
            }));
          } else if (event.type === "failure") {
            if (event.rateLimited) {
              providerRateLimited = true;
              setRateLimited(true);
            }
            updateSearch((previous) => ({
              listingStates: {
                ...previous.listingStates,
                [event.side]: "error",
              },
              ...(event.rateLimited
                ? { error: MARKETPLACE_RATE_LIMIT_MESSAGE }
                : {}),
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
      const result = data.data as { sold?: unknown; active?: unknown };
      updateSearch({
        response: data.data,
        firstListingType: result.sold != null ? "sold" : "active",
        listingStates: {
          sold: result.sold != null ? "success" : "error",
          active: result.active != null ? "success" : "error",
        },
      });
    } catch {
      if (!signal.aborted && isCurrentRequest(signal)) {
        updateSearch((previous) => ({
          error: providerRateLimited
            ? MARKETPLACE_RATE_LIMIT_MESSAGE
            : EBAY_REQUEST_ERROR,
          listingStates: {
            sold:
              previous.listingStates.sold === "pending"
                ? "error"
                : previous.listingStates.sold,
            active:
              previous.listingStates.active === "pending"
                ? "error"
                : previous.listingStates.active,
          },
        }));
        // A failed provider request can refund a previously reserved credit.
        void refreshCredits();
      }
    } finally {
      if (!signal.aborted && isCurrentRequest(signal)) {
        requestPendingRef.current = false;
        setLoadingMode(null);
      }
    }
  }

  const modeControl = (
    <RadioButtonGroup<EbayMode>
      ariaLabel="Ebay card type"
      className="ebay-section__mode"
      options={[
        { value: "raw", label: "Raw" },
        { value: "graded", label: "Graded" },
      ]}
      value={mode}
      onChange={(nextMode) => {
        restoreModeFocus.current = Boolean(
          document.activeElement?.closest(".ebay-section__mode"),
        );
        setMode(nextMode);
      }}
    />
  );

  return (
    <section
      ref={sectionRef}
      aria-label="Ebay sales and listings"
      className="ebay-section"
    >
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
          icon={Gavel}
          label="Sales & listings"
          hideIdentity={hasUsableResponse}
          actionLabel={noCredits ? "Add credits" : "1 Market credit"}
          actionLoading={loadingMode === mode && !headerError}
          actionLoadingLabel="Loading listings and sales..."
          actionLoadingMessage="Loading listings and sales..."
          errorMessage={headerError}
          actionDisabled={
            loading ||
            rateLimited ||
            (noCredits ? false : authLoading || !emailVerified || !credits)
          }
          controls={!hasUsableResponse ? modeControl : undefined}
          actionHidden={isDemo || (hasUsableResponse && !headerError)}
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
        </CardFeatureHeader>
      )}
      {isDemo && !hasResponse && (
        <p className="ebay-section__notice">
          This demo has no saved {mode} eBay results.
        </p>
      )}
      {(["raw", "graded"] as const).map((viewMode) => {
        const data = isDemo
          ? demoResponses[viewMode]
          : searches[viewMode].response;
        if (data == null) return null;
        return (
          <div
            key={viewMode}
            hidden={mode !== viewMode}
            className="ebay-section__results default-container"
          >
            <EbaySoldView
              mode={viewMode}
              topControls={
                mode === viewMode && hasUsableResponse ? modeControl : undefined
              }
              response={data}
              initialListingType={
                isDemo ? "sold" : searches[viewMode].firstListingType
              }
              listingStates={
                isDemo ? undefined : searches[viewMode].listingStates
              }
            />
          </div>
        );
      })}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
    </section>
  );
});
