import { useEffect, useState } from "react";
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useSavedListingsCache } from "../../context/SavedListingsCacheContext";
import {
  LISTINGS_PAGE1_CACHE_KEY,
  LISTINGS_PAGE1_CACHE_TIME,
} from "../../constants/cache";
import type { Listing, ListingBid } from "../../types/listing.types";
import type { AppNotification } from "../../types/notification.types";
import { getTimestampMillis } from "../../utils/timestamp";
import { getMyListingsCacheKey } from "../../utils/cache";

type CachedListing = Omit<Listing, "createdAt"> & {
  createdAt: {
    seconds: number;
    nanoseconds: number;
  };
};

type CacheShape = {
  timestamp: number;
  data: CachedListing[];
};

export function useFetchListings() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchListings = async () => {
      const cachedData = localStorage.getItem(LISTINGS_PAGE1_CACHE_KEY);
      if (cachedData) {
        const parsed: CacheShape = JSON.parse(cachedData);
        const isFresh = Date.now() - parsed.timestamp < LISTINGS_PAGE1_CACHE_TIME;
        if (isFresh) {
          const restored = parsed.data.map((listing) => ({
            ...listing,
            createdAt: new Timestamp(
              listing.createdAt.seconds,
              listing.createdAt.nanoseconds
            ),
          }));
          setListings(restored);
          setLoading(false);
          return;
        }
      }

      const snap = await getDocs(collection(db, "listings"));
      const data: Listing[] = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Listing, "id">),
      }));
      setListings(data);
      localStorage.setItem(
        LISTINGS_PAGE1_CACHE_KEY,
        JSON.stringify({ timestamp: Date.now(), data })
      );
      setLoading(false);
    };

    fetchListings();
  }, []);

  return { listings, loading };
}

export function useFetchUserListings(userId?: string) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserListings = async (
    uid = userId,
    options: { forceRefresh?: boolean } = {}
  ) => {
    if (!uid) {
      setListings([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const cacheKey = getMyListingsCacheKey(uid);
      const cachedListings = localStorage.getItem(cacheKey);

      if (cachedListings && !options.forceRefresh) {
        setListings(JSON.parse(cachedListings));
        return;
      }

      const q = query(collection(db, "listings"), where("userId", "==", uid));
      const snap = await getDocs(q);
      const data: Listing[] = snap.docs.map((docSnap) => ({
        ...(docSnap.data() as Omit<Listing, "id">),
        id: docSnap.id,
      }));
      setListings(data);
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (err) {
      console.error(err);
      setError("Failed to fetch user listings.");
      setListings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserListings(userId, { forceRefresh: true });
  }, [userId]);

  return {
    listings,
    loading,
    error,
    fetchUserListings,
  };
}

export type UserBid = ListingBid;

export function useFetchUserBids(userId?: string) {
  const [bids, setBids] = useState<UserBid[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserBids = async (uid = userId) => {
      if (!uid) {
        setBids([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const bidsQuery = query(
          collection(db, "bids"),
          where("bidderId", "==", uid)
        );
        const snap = await getDocs(bidsQuery);
        const userBids = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<ListingBid, "id">),
        }));

        userBids.sort(
          (a, b) =>
            getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt) ||
            b.amount - a.amount
        );
        setBids(userBids);
      } catch (err) {
        console.error(err);
        setError("Failed to fetch your bids.");
        setBids([]);
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    fetchUserBids();
  }, [userId]);

  return { bids, loading, error, fetchUserBids };
}

export function useUpdateSavedListings(userId?: string | null) {
  const {
    addToSavedListingsCache,
    removeFromSavedListingsCache,
    isListingSavedCache,
  } = useSavedListingsCache();

  const saveListing = async (listing: Listing) => {
    const listingId = listing.id;

    if (!userId || !listingId) return;

    try {
      await setDoc(
        doc(db, "users", userId),
        { savedListings: arrayUnion(listingId) },
        { merge: true }
      );

      addToSavedListingsCache(listing);
    } catch (error) {
      console.error("Failed to save listing:", error);
      throw error;
    }
  };

  const removeSavedListing = async (listingId: string) => {
    if (!userId || !listingId) return;

    try {
      await setDoc(
        doc(db, "users", userId),
        { savedListings: arrayRemove(listingId) },
        { merge: true }
      );

      removeFromSavedListingsCache(listingId);
    } catch (error) {
      console.error("Failed to remove saved listing:", error);
      throw error;
    }
  };

  return {
    saveListing,
    removeSavedListing,
    isListingSaved: isListingSavedCache,
  };
}

export function useBidding(userId?: string | null, userName?: string | null) {
  const bidOnListing = async (listing: Listing, amount: number) => {
    if (!userId || !listing.id) return null;

    const bid: Omit<ListingBid, "id"> = {
      listingId: listing.id,
      listingTitle: listing.title,
      listingPrice: listing.price,
      sellerId: listing.userId,
      bidderId: userId,
      bidderName: userName ?? null,
      amount,
      createdAt: Timestamp.now(),
      status: "active",
    };

    try {
      const listingRef = doc(db, "listings", listing.id);
      const bidRef = doc(collection(db, "bids"));
      const notificationRef = doc(collection(db, "notifications"));
      const updatedListing = await runTransaction(db, async (transaction) => {
        const listingSnap = await transaction.get(listingRef);

        if (!listingSnap.exists()) {
          throw new Error("Listing not found.");
        }

        const freshListing = {
          id: listingSnap.id,
          ...(listingSnap.data() as Omit<Listing, "id">),
        };

        // bud bypass her
        // if (freshListing.userId === userId) {
        //   throw new Error("You cannot bid on your own listing.");
        // }

        const highestBid = Math.max(
          freshListing.price,
          freshListing.highestBidAmount ?? 0
        );

        if (amount <= highestBid) {
          throw new Error(`Bid must be higher than ${highestBid} kr.`);
        }

        const bidWithId = { ...bid, id: bidRef.id };
        const bidCount = (freshListing.bidCount ?? 0) + 1;
        const notification: Omit<AppNotification, "id"> = {
          userId: freshListing.userId,
          type: "bid_received",
          listingId: freshListing.id,
          listingTitle: freshListing.title,
          bidId: bidRef.id,
          bidAmount: amount,
          bidderId: userId,
          bidderName: userName ?? null,
          read: false,
          createdAt: Timestamp.now(),
        };

        transaction.set(bidRef, bid);
        transaction.set(notificationRef, notification);
        transaction.update(listingRef, {
          highestBidAmount: amount,
          highestBidderId: userId,
          bidCount,
        });

        return {
          ...freshListing,
          highestBidAmount: amount,
          highestBidderId: userId,
          bidCount,
          bid: bidWithId,
        };
      });

      localStorage.removeItem(LISTINGS_PAGE1_CACHE_KEY);
      localStorage.removeItem(getMyListingsCacheKey(listing.userId));

      const { bid: createdBid, ...listingData } = updatedListing;
      return { bid: createdBid, listing: listingData };
    } catch (error) {
      console.error("Failed to bid on listing:", error);
      throw error;
    }
  };

  const withdrawBid = async (bid: ListingBid) => {
    if (!userId || !bid.id) return null;

    const activeBidsQuery = query(
      collection(db, "bids"),
      where("listingId", "==", bid.listingId)
    );
    const activeBidsSnap = await getDocs(activeBidsQuery);
    const nextHighestBid = activeBidsSnap.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<ListingBid, "id">),
      }))
      .filter(
        (currentBid) =>
          currentBid.id !== bid.id && currentBid.status === "active"
      )
      .sort(
        (a, b) =>
          b.amount - a.amount ||
          getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt)
      )[0];

    try {
      const bidRef = doc(db, "bids", bid.id);
      const listingRef = doc(db, "listings", bid.listingId);

      const updatedListing = await runTransaction(db, async (transaction) => {
        const bidSnap = await transaction.get(bidRef);
        const listingSnap = await transaction.get(listingRef);

        if (!bidSnap.exists()) {
          throw new Error("Bid not found.");
        }

        if (!listingSnap.exists()) {
          throw new Error("Listing not found.");
        }

        const freshBid = {
          id: bidSnap.id,
          ...(bidSnap.data() as Omit<ListingBid, "id">),
        };
        const freshListing = {
          id: listingSnap.id,
          ...(listingSnap.data() as Omit<Listing, "id">),
        };

        if (freshBid.bidderId !== userId) {
          throw new Error("You can only withdraw your own bids.");
        }

        if (freshBid.status !== "active") {
          throw new Error("Only active bids can be withdrawn.");
        }

        const listingUpdates: Partial<Listing> = {
          bidCount: Math.max((freshListing.bidCount ?? 1) - 1, 0),
        };
        const isHighestBid =
          freshListing.highestBidderId === userId &&
          freshListing.highestBidAmount === freshBid.amount;

        if (isHighestBid) {
          listingUpdates.highestBidAmount = nextHighestBid?.amount ?? 0;
          listingUpdates.highestBidderId = nextHighestBid?.bidderId ?? null;
        }

        transaction.update(bidRef, { status: "withdrawn" });
        transaction.update(listingRef, listingUpdates);

        return {
          ...freshListing,
          ...listingUpdates,
        };
      });

      localStorage.removeItem(LISTINGS_PAGE1_CACHE_KEY);
      localStorage.removeItem(getMyListingsCacheKey(bid.sellerId));

      return updatedListing;
    } catch (error) {
      console.error("Failed to withdraw bid:", error);
      throw error;
    }
  };

  return { bidOnListing, withdrawBid };
}
