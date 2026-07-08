import {
  doc,
  getDoc,
  deleteDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { usePortfolioCache } from "../../context/PortfolioCacheContext";
import {
  useBidding,
  useFetchUserBids,
  useFetchUserListings,
} from "../../hooks/listings";
import "./Profile.scss";
import type { Listing, ListingBid } from "../../types/listing.types";
import { LISTINGS_PAGE1_CACHE_KEY } from "../../constants/cache";
import type { PokemonCard as PokemonCardType } from "../../types/pokemon";
import {
  getMyListingsCacheKey,
  getUserProfileSessionKey,
} from "../../utils/cache";
import { PokemonCard } from "../../components/pokemonCard/PokemonCard";
import { GridView } from "../../components/gridView/GridView";
import Button from "../../components/button/Button";
import ListingCard from "../../components/listingCard/ListingCard";
import { useSavedListingsCache } from "../../context/SavedListingsCacheContext";
import type { UserProfile } from "../../types/user.types";
import { useInitials } from "../../hooks/useInitials";
import { usePokemonPortfolio } from "../../hooks/pokemonPortfolio";
import {
  formatTimestampDateTime,
  formatTimestampString,
} from "../../utils/timestamp";

export default function Profile() {
  const navigate = useNavigate();
  const { user: authUser, loading: authLoading, logout } = useAuth();
  const { portfolio } = usePortfolioCache();
  const { savedListings, loadingSavedListings } = useSavedListingsCache();
  const { removePokemonFromPortfolio } = usePokemonPortfolio();
  const { withdrawBid } = useBidding(authUser?.uid);
  const bidStatusLabels: Record<ListingBid["status"], string> = {
    active: "Aktiv",
    withdrawn: "Tilbaketrukket",
    accepted: "Akseptert",
    rejected: "Avvist",
  };

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPrice, setEditPrice] = useState(0);
  const [editDescription, setEditDescription] = useState("");
  const [withdrawingBidId, setWithdrawingBidId] = useState<string | null>(null);
  const profileInitial = useInitials(profile?.firstName);

  const {
    listings: myListings,
    loading: loadingListings,
    error: listingsError,
    fetchUserListings,
  } = useFetchUserListings(authUser?.uid);
  const {
    bids: myBids,
    loading: loadingBids,
    error: bidsError,
    fetchUserBids,
  } = useFetchUserBids(authUser?.uid);

  const startEdit = (listing: Listing) => {
    setEditingId(listing.id);
    setEditTitle(listing.title);
    setEditPrice(listing.price);
    setEditDescription(listing.description);
  };

  const handleUpdate = async (listingId: string) => {
    if (!authUser) {
      alert("User not logged in.");
      return;
    }

    try {
      await updateDoc(doc(db, "listings", listingId), {
        title: editTitle,
        price: editPrice,
        description: editDescription,
      });

      localStorage.removeItem(LISTINGS_PAGE1_CACHE_KEY);
      localStorage.removeItem(getMyListingsCacheKey(authUser.uid));
      await fetchUserListings(authUser.uid, { forceRefresh: true });
      setEditingId(null);
    } catch (err) {
      console.error(err);
      alert("Kunne ikke oppdatere annonsen.");
    }
  };

  const handleDelete = async (listingId: string) => {
    const confirmed = window.confirm(
      "Er du sikker på at du vil slette annonsen?"
    );

    if (!confirmed) return;

    if (!authUser) {
      alert("Du må være logget inn.");
      return;
    }

    try {
      await deleteDoc(doc(db, "listings", listingId));
      localStorage.removeItem(LISTINGS_PAGE1_CACHE_KEY);
      localStorage.removeItem(getMyListingsCacheKey(authUser.uid));
      await fetchUserListings(authUser.uid, { forceRefresh: true });
      alert("Annonsen ble slettet.");
    } catch (err) {
      console.error(err);
      alert("Kunne ikke slette annonsen.");
    }
  };

  const handleWithdrawBid = async (bid: ListingBid) => {
    if (!authUser) {
      alert("Du må være logget inn.");
      return;
    }

    if (bid.status !== "active") {
      alert("Kun aktive bud kan trekkes tilbake.");
      return;
    }

    const confirmed = window.confirm(
      "Er du sikker på at du vil trekke tilbake budet?"
    );
    if (!confirmed) return;

    try {
      setWithdrawingBidId(bid.id ?? null);
      await withdrawBid(bid);
      await fetchUserBids(authUser.uid);
      alert("Budet ble trukket tilbake.");
    } catch (error) {
      console.error("Failed to withdraw bid:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Kunne ikke trekke tilbake budet."
      );
    } finally {
      setWithdrawingBidId(null);
    }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      if (!authUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const cacheKey = getUserProfileSessionKey(authUser.uid);
        const cachedProfile = sessionStorage.getItem(cacheKey);

        if (cachedProfile) {
          const parsedProfile = JSON.parse(cachedProfile);
          if (parsedProfile.createdAt?.seconds) {
            parsedProfile.createdAt = Timestamp.fromMillis(
              parsedProfile.createdAt.seconds * 1000
            );
          }
          setProfile(parsedProfile);
          return;
        }

        const userRef = doc(db, "users", authUser.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          setProfile(null);
          setError("Logged in but no user profile found.");
          return;
        }

        const userData = userSnap.data();

        sessionStorage.setItem(cacheKey, JSON.stringify(userData));
        setProfile(userData);
      } catch (err) {
        console.error(err);
        setError("Failed to fetch user data.");
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [authUser]);

  if (authLoading || loading) return <h1>Loading...</h1>;

  if (!authUser) return <h1>User not logged in</h1>;

  if (error) {
    return (
      <div>
        <h1>{error}</h1>
        <Button onClick={logout}>Log out</Button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div>
        <h1>Logged in but no profile data found</h1>
        <Button onClick={logout}>Log out</Button>
      </div>
    );
  }

  return (
    <div className="profile">
      <h1>My Profile</h1>

      <div className="profile__card">
        {profile.avatar?.trim() ? (
          <img
            className="profile__avatar"
            src={profile.avatar.trim()}
            alt={profile.username ?? "Profile avatar"}
          />
        ) : (
          <div className="profile__avatar profile__avatar--fallback">
            {profileInitial}
          </div>
        )}
        <p>
          <b>Username:</b> {profile.username}
        </p>
        <p>
          <b>Email:</b> {profile.email}
        </p>
        <p>
          <b>User ID:</b> {authUser.uid}
        </p>
        <p>
          <b>Joined:</b> {formatTimestampString(profile.createdAt)}
        </p>
      </div>

      <section className="profile__portfolio">
        <h2>My collection</h2>

        {portfolio.length === 0 ? (
          <p>No saved cards yet.</p>
        ) : (
          <GridView>
            {portfolio.map((card: PokemonCardType) => (
              <div key={card.id} className="profile__portfolio-card">
                <PokemonCard card={card} />
                <Button variant="danger" onClick={() => removePokemonFromPortfolio(card.id)}>
                  Remove
                </Button>
              </div>
            ))}
          </GridView>
        )}
      </section>

      <section className="profile__saved-listings">
        <h2>Saved listings</h2>

        {loadingSavedListings ? (
          <p>Loading saved listings...</p>
        ) : savedListings.length === 0 ? (
          <p>No saved listings yet.</p>
        ) : (
          <GridView>
            {savedListings.map((listing: Listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </GridView>
        )}
      </section>

      <section className="profile__bids">
        <h2>Mine bud</h2>

        {loadingBids ? (
          <p>Laster bud...</p>
        ) : bidsError ? (
          <p>{bidsError}</p>
        ) : myBids.length === 0 ? (
          <p>Du har ikke lagt inn noen bud enda.</p>
        ) : (
          <div className="profile__bid-list">
            {myBids.map((bid, index) => (
              <div
                className={`profile__bid profile__bid--${bid.status}`}
                key={`${bid.listingId}-${bid.amount}-${index}`}
                onClick={() => navigate(`/listing/${bid.listingId}`)}
                role="button"
                tabIndex={0}
              >
                <div>
                  <p className="profile__bid-title">{bid.listingTitle}</p>
                  <p className="profile__bid-meta">
                    Startpris: {bid.listingPrice} kr
                  </p>
                  <p className="profile__bid-status">
                    {bidStatusLabels[bid.status]}
                  </p>
                </div>
                <div className="profile__bid-values">
                  <p className="profile__bid-amount">{bid.amount} kr</p>
                  <p className="profile__bid-meta">
                    {formatTimestampDateTime(bid.createdAt)}
                  </p>
                </div>
                {bid.status === "active" && (
                  <Button
                    variant="danger"
                    disabled={withdrawingBidId === bid.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleWithdrawBid(bid);
                    }}
                  >
                    {withdrawingBidId === bid.id
                      ? "Trekker tilbake..."
                      : "Trekk tilbake"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="profile__actions">
        <Button onClick={logout}>Log out</Button>
      </div>

      {loadingListings && <p>Laster annonser...</p>}
      {listingsError && <p>{listingsError}</p>}

      {myListings.length > 0 && (
        <section className="profile__listings">
          <h2>Mine annonser</h2>

          <GridView>
            {myListings.map((listing: Listing) => (
              <div key={listing.id} className="listing-card-container">
                <ListingCard listing={listing} />

                {editingId === listing.id ? (
                  <div className="profile__listing-edit">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />

                    <input
                      type="number"
                      value={editPrice}
                      onChange={(e) => setEditPrice(Number(e.target.value))}
                    />

                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                    />

                    <Button variant="primary" onClick={() => handleUpdate(listing.id)}>
                      Lagre
                    </Button>
                    <Button onClick={() => setEditingId(null)}>Avbryt</Button>
                  </div>
                ) : (
                  <div className="profile__listing-actions">
                    <Button
                      className="profile__action-btn"
                      variant="primary"
                      onClick={() => startEdit(listing)}
                    >
                      Rediger
                    </Button>
                    <Button
                      className="profile__action-btn"
                      variant="danger"
                      onClick={() => handleDelete(listing.id)}
                    >
                      Slett
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </GridView>
        </section>
      )}

      {!loadingListings && myListings.length === 0 && (
        <p>Ingen annonser hentet ennå.</p>
      )}
    </div>
  );
}
