import { useNavigate } from "react-router-dom";
import { useState } from "react";
import type { MouseEvent } from "react";
import BaseCard from "../basecard/BaseCard";
import "./ListingCard.scss";
import type { Listing } from "../../types/listing.types";
import { FALLBACK_LISTING_IMAGE } from "../../constants/listing";
import Button from "../button/Button";
import { useAuth } from "../../context/AuthContext";
import { SELECTED_LISTING_CACHE_KEY } from "../../constants/cache";
import { useInitials } from "../../hooks/useInitials";
import { useUpdateSavedListings } from "../../hooks/listings";

export default function ListingCard({ listing }: { listing: Listing }) {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const {
    saveListing,
    removeSavedListing,
    isListingSaved,
  } = useUpdateSavedListings(
    authUser?.uid
  );

  const [saving, setSaving] = useState(false);
  const listingImage = listing.images?.[0] ?? FALLBACK_LISTING_IMAGE;
  const userAvatar = listing.userAvatar?.trim();
  const listingId = listing.id;
  const alreadySaved = isListingSaved(listingId);
  const sellerInitial = useInitials(listing.userName);

  function handleClick() {
    localStorage.setItem(
      SELECTED_LISTING_CACHE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        data: listing,
      })
    );
    navigate(`/listing/${listing.id}`);
  }

  function handleViewSeller(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();

    if (!listing.userId) return;
    navigate(`/user/${listing.userId}`);
  }

  async function handleToggleSaveClick(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();

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

      if (alreadySaved) {
        await removeSavedListing(listingId);
      } else {
        await saveListing(listing);
      }
    } catch (error) {
      console.error("Failed to update saved listing:", error);
      alert("Kunne ikke lagre/slette annonse.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="listing-card">
      <BaseCard onClick={handleClick}>
        <img src={listingImage} alt={listing.title} />
        <h2>{listing.title}</h2>
        <p className="price">{listing.price} NOK</p>
        <div className="listing-card__seller-row">
          {userAvatar ? (
            <img
              className="listing-card__seller-avatar"
              src={userAvatar}
              alt={listing.userName ?? "Seller avatar"}
            />
          ) : (
            <div className="listing-card__seller-avatar listing-card__seller-avatar--fallback">
              {sellerInitial}
            </div>
          )}
          <button
            className="seller"
            type="button"
            onClick={handleViewSeller}
            disabled={!listing.userId}
          >
            {listing.userName ?? "Ukjent bruker"}
          </button>
        </div>
        <p className="description">
          {listing.description}
        </p>
        <Button
          className="listing-card__save"
          onClick={handleToggleSaveClick}
          disabled={saving}
        >
          {saving
            ? alreadySaved
              ? "Fjerner..."
              : "Lagrer..."
            : alreadySaved
            ? "Lagret"
            : "Lagre"}
        </Button>
      </BaseCard>
    </div>
  );
}
