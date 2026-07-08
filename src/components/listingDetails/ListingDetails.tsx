import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import "./ListingDetails.scss";
import type { Listing, ListingBid, ListingDoc } from "../../types/listing.types";
import type { UserProfile } from "../../types/user.types";
import Button from "../button/Button";
import { FALLBACK_LISTING_IMAGE } from "../../constants/listing";
import { useAuth } from "../../context/AuthContext";
import {
  SELECTED_LISTING_CACHE_KEY,
  SELECTED_LISTING_CACHE_TIME,
} from "../../constants/cache";
import { useInitials } from "../../hooks/useInitials";
import { useBidding, useUpdateSavedListings } from "../../hooks/listings";
import {
  formatTimestampDate,
  formatTimestampDateTime,
  getTimestampMillis,
} from "../../utils/timestamp";

const FALLBACK_IMAGES = [
  FALLBACK_LISTING_IMAGE,
  FALLBACK_LISTING_IMAGE,
  FALLBACK_LISTING_IMAGE,
];

const bidStatusLabels: Record<ListingBid["status"], string> = {
  active: "Aktiv",
  withdrawn: "Tilbaketrukket",
  accepted: "Akseptert",
  rejected: "Avvist",
};

type SelectedListingCache = {
  timestamp: number;
  data: Listing;
};

export const ListingDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const {
    saveListing,
    removeSavedListing,
    isListingSaved,
  } = useUpdateSavedListings(
    authUser?.uid
  );
  const { bidOnListing } = useBidding(
    authUser?.uid,
    authUser?.displayName
  );

  const [listing, setListing] = useState<Listing | null>(null);
  const [bids, setBids] = useState<ListingBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bidding, setBidding] = useState(false);
  const [sellerProfile, setSellerProfile] = useState<UserProfile | null>(null);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [sellerError, setSellerError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(FALLBACK_LISTING_IMAGE);
  const [activeIndex, setActiveIndex] = useState(0);
  const sellerInitial = useInitials(sellerProfile?.firstName);

  const fetchFreshListing = async (listingId: string) => {
    const listingRef = doc(db, "listings", listingId);
    const listingSnap = await getDoc(listingRef);

    if (!listingSnap.exists()) {
      setListing(null);
      return null;
    }

    const fetchedListing = {
      id: listingSnap.id,
      ...(listingSnap.data() as ListingDoc),
    } as Listing;

    localStorage.setItem(
      SELECTED_LISTING_CACHE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        data: fetchedListing,
      })
    );
    setListing(fetchedListing);
    return fetchedListing;
  };

  const fetchListingBids = async (listingId: string) => {
    const bidsQuery = query(
      collection(db, "bids"),
      where("listingId", "==", listingId)
    );
    const bidsSnap = await getDocs(bidsQuery);
    const fetchedBids = bidsSnap.docs.map((bidDoc) => ({
      id: bidDoc.id,
      ...(bidDoc.data() as Omit<ListingBid, "id">),
    }));

    fetchedBids.sort(
      (a, b) =>
        b.amount - a.amount ||
        getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt)
    );
    setBids(fetchedBids);
    return fetchedBids;
  };

  useEffect(() => {
    async function fetchListing() {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        const storedListing = localStorage.getItem(SELECTED_LISTING_CACHE_KEY);

        if (storedListing) {
          const parsedListing = JSON.parse(storedListing) as
            | SelectedListingCache
            | Listing;
          const cachedListing =
            "data" in parsedListing ? parsedListing.data : parsedListing;
          const cachedAt =
            "timestamp" in parsedListing ? parsedListing.timestamp : 0;
          const cacheIsFresh =
            Date.now() - cachedAt < SELECTED_LISTING_CACHE_TIME;

          if (cachedListing?.id === id && cacheIsFresh) {
            setListing(cachedListing);
            return;
          }
        }

        await fetchFreshListing(id);
      } catch (error) {
        console.error("Failed to load listing:", error);
        setListing(null);
      } finally {
        setLoading(false);
      }
    }

    fetchListing();
  }, [id]);

  useEffect(() => {
    if (!listing?.id) return;
    fetchListingBids(listing.id);
  }, [listing?.id]);

  useEffect(() => {
    if (!listing) return;
    const firstImage = listing.images?.[0] ?? FALLBACK_LISTING_IMAGE;
    setActiveImage(firstImage);
    setActiveIndex(0);
  }, [listing]);

  useEffect(() => {
    async function fetchSellerProfile() {
      if (!listing?.userId) return;
      setSellerLoading(true);
      setSellerError(null);

      try {
        const userRef = doc(db, "users", listing.userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          setSellerProfile(null);
          setSellerError("Seller information unavailable.");
          return;
        }

        setSellerProfile(userSnap.data() as UserProfile);
      } catch (error) {
        console.error("Failed to load seller profile:", error);
        setSellerError("Failed to load seller information.");
        setSellerProfile(null);
      } finally {
        setSellerLoading(false);
      }
    }

    fetchSellerProfile();
  }, [listing]);

  if (loading) return <h1>Loading listing...</h1>;
  if (!listing) return <h1>Listing not found</h1>;

  const images = listing.images?.length ? listing.images : FALLBACK_IMAGES;
  const listingId = listing.id;
  const alreadySaved = isListingSaved(listingId);
  const highestBid = Math.max(
    listing.price,
    listing.highestBidAmount ?? 0
  );

  const handleSaveListing = async () => {
    if (!listingId) {
      alert("Denne annonsen mangler ID og kan ikke lagres.");
      return;
    }

    if (!authUser) {
      alert("Du må være logget inn for å lagre annonsen.");
      return;
    }

    try {
      setSaving(true);

      await saveListing(listing);
      alert("Annonsen ble lagret.");
    } catch (error) {
      console.error("Failed to save listing:", error);
      alert("Kunne ikke lagre annonsen.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSavedListing = async () => {
    if (!listingId) {
      alert("Denne annonsen mangler ID og kan ikke fjernes.");
      return;
    }

    if (!authUser) {
      alert("Du må være logget inn.");
      return;
    }

    try {
      setSaving(true);

      await removeSavedListing(listingId);
      alert("Annonsen ble fjernet fra lagrede annonser.");
    } catch (error) {
      console.error("Failed to remove saved listing:", error);
      alert("Kunne ikke fjerne annonsen.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSaveListingClick = () => {
    if (alreadySaved) {
      handleRemoveSavedListing();
    } else {
      handleSaveListing();
    }
  };

  const handleBidding = async () => {
    if (!listingId) {
      alert("Denne annonsen mangler ID og kan ikke bys på.");
      return;
    }

    if (!authUser) {
      alert("Du må være logget inn for å by på annonsen.");
      return;
    }

    // bud bypass her
    // if (authUser.uid === listing.userId) {
    //   alert("Du kan ikke by på din egen annonse.");
    //   return;
    // }

    const bidInput = window.prompt(
      `Legg inn bud høyere enn ${highestBid} kr:`
    );
    if (bidInput === null) return;

    const bidAmount = Number(bidInput.replace(",", "."));
    if (!Number.isFinite(bidAmount) || bidAmount <= highestBid) {
      alert(`Budet må være høyere enn ${highestBid} kr.`);
      return;
    }

    try {
      setBidding(true);

      const result = await bidOnListing(listing, bidAmount);
      if (!result) return;

      setListing(result.listing);
      setBids((currentBids) =>
        [result.bid, ...currentBids].sort(
          (a, b) =>
            b.amount - a.amount ||
            getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt)
        )
      );
      localStorage.setItem(
        SELECTED_LISTING_CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          data: result.listing,
        })
      );

      alert("Budet ble lagt inn.");
    } catch (error) {
      console.error("Failed to bid on listing:", error);
      await fetchFreshListing(listingId);
      await fetchListingBids(listingId);
      alert(
        error instanceof Error ? error.message : "Kunne ikke legge inn bud."
      );
    } finally {
      setBidding(false);
    }
  };

  const handleViewSeller = () => {
    if (!listing.userId) return;
    navigate(`/user/${listing.userId}`);
  };

  return (
    <div className="listing-details-container">
      <div className="listing-details__header">
        <div>
          <p className="listing-details__tag">Listing details</p>
          <h1 className="listing-details__title">{listing.title}</h1>
        </div>
        <Button variant="default" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

      <div className="listing-details__grid">
        <article className="listing-details__media">
          <img
            src={activeImage}
            alt={listing.title}
            className="listing-details__image"
          />

          <div className="listing-details__thumbs">
            {images.map((src, index) => (
              <button
                key={index}
                type="button"
                className={`listing-details__thumb ${
                  activeImage === src ? "active" : ""
                }`}
                onClick={() => {
                  if (index === activeIndex) return;
                  setActiveIndex(index);
                  setActiveImage(src);
                }}
              >
                <img src={src} alt={`${listing.title} thumbnail ${index + 1}`} />
              </button>
            ))}
          </div>
        </article>

        <article className="listing-details__info">
          <div className="listing-details__meta-row">
            <div>
              <p className="listing-details__label">Price</p>
              <p className="listing-details__price">{listing.price} kr</p>
            </div>
            <div>
              <p className="listing-details__label">Highest bid</p>
              <p className="listing-details__price">{highestBid} kr</p>
            </div>
            <div>
              <p className="listing-details__label">Seller</p>
              <button
                className="listing-details__seller"
                type="button"
                onClick={handleViewSeller}
                disabled={!listing.userId}
              >
                {sellerProfile?.username || "Unknown Seller"}
              </button>
            </div>
          </div>

          <section className="listing-details__user-section">
            <p className="listing-details__section-title">Seller profile</p>
            {sellerLoading ? (
              <p>Loading seller info...</p>
            ) : sellerError ? (
              <p>{sellerError}</p>
            ) : sellerProfile ? (
              <>
                {sellerProfile.avatar?.trim() ? (
                  <img
                    className="listing-details__seller-avatar"
                    src={sellerProfile.avatar.trim()}
                    alt={sellerProfile.username ?? "Seller avatar"}
                  />
                ) : (
                  <div className="listing-details__seller-avatar listing-details__seller-avatar--fallback">
                    {sellerInitial}
                  </div>
                )}
                <p>
                  <strong>Username:</strong> {sellerProfile.username || listing.userName || "N/A"}
                </p>
                <p>
                  <strong>Name:</strong>{" "}
                  {sellerProfile.firstName || ""} {sellerProfile.lastName || ""}
                </p>
                <p>
                  <strong>Email:</strong> {sellerProfile.email || "N/A"}
                </p>
                <p>
                  <strong>City:</strong> {sellerProfile.city || "N/A"}
                </p>
                <p>
                  <strong>Address:</strong> {sellerProfile.address || "N/A"}
                </p>
                <p>
                  <strong>Joined:</strong>{" "}
                  {formatTimestampDate(sellerProfile.createdAt)}
                </p>
                <Button onClick={handleViewSeller}>Vis bruker</Button>
              </>
            ) : (
              <p>Seller information unavailable.</p>
            )}
          </section>

          <section className="listing-details__section">
            <p className="listing-details__section-title">Description</p>
            <p>{listing.description || "No description provided."}</p>
          </section>

          <div className="listing-details__actions">
            <Button onClick={handleToggleSaveListingClick} disabled={saving}>
              {saving
                ? alreadySaved
                  ? "Fjerner..."
                  : "Lagrer..."
                : alreadySaved
                ? "Fjern fra lagrede"
                : "Lagre annonse"}
            </Button>
            <Button onClick={handleBidding} disabled={bidding}>
              {bidding ? "Legger inn bud..." : "Bid"}
            </Button>
          </div>

          <section className="listing-details__section listing-details__section--compact">
            <div>
              <p className="listing-details__section-title">Listing ID</p>
              <p>{listing.id}</p>
            </div>
            <div>
              <p className="listing-details__section-title">Status</p>
              <p className="listing-details__status">Active</p>
            </div>
          </section>
        </article>
      </div>

      <div className="listing-details__bids">
        <p className="listing-details__section-title">Bud</p>
        {bids.length === 0 ? (
          <p className="listing-details__empty">Ingen bud enda.</p>
        ) : (
          <div className="listing-details__bid-list">
            {bids.map((bid, index) => (
              <div
                className={`listing-details__bid listing-details__bid--${bid.status}`}
                key={`${bid.id ?? bid.bidderId}-${bid.amount}-${getTimestampMillis(bid.createdAt)}-${index}`}
              >
                <div>
                  <p className="listing-details__bid-amount">
                    {bid.amount} kr
                  </p>
                  <p className="listing-details__bidder">
                    {bid.bidderName || "Ukjent bruker"}
                  </p>
                  <p className="listing-details__bid-status">
                    {bidStatusLabels[bid.status]}
                  </p>
                </div>
                <p className="listing-details__bid-date">
                  {formatTimestampDateTime(bid.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
