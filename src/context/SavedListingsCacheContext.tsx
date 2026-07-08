import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import { getMySavedListingsCacheKey } from "../utils/cache";
import type { Listing } from "../types/listing.types";

type SavedListingsContextType = {
  savedListings: Listing[];
  loadingSavedListings: boolean;
  initSavedListings: () => Promise<void>;
  addToSavedListingsCache: (listing: Listing) => void;
  removeFromSavedListingsCache: (listingId: string) => void;
  isListingSavedCache: (listingId?: string | null) => boolean;
};

const SavedListingsContext =
  createContext<SavedListingsContextType | null>(null);

const isValidListing = (listing: Listing): listing is Listing => {
  return typeof listing.id === "string" && listing.id.length > 0;
};

export function SavedListingsProvider({ children }: { children: ReactNode }) {
  const { user: authUser } = useAuth();

  const [savedListings, setSavedListings] = useState<Listing[]>([]);
  const [loadingSavedListings, setLoadingSavedListings] = useState(true);

  const saveListingsToCache = (updatedListings: Listing[]) => {
    if (!authUser) return;

    const cacheKey = getMySavedListingsCacheKey(authUser.uid);
    localStorage.setItem(cacheKey, JSON.stringify(updatedListings));
  };

  const initSavedListings = async () => {
    if (!authUser) {
      setSavedListings([]);
      setLoadingSavedListings(false);
      return;
    }

    try {
      setLoadingSavedListings(true);

      const savedListingsRef = collection(
        db,
        "users",
        authUser.uid,
        "savedListings"
      );
      const savedListingsSnap = await getDocs(savedListingsRef);

      const listings = savedListingsSnap.docs.map((doc) => ({
        ...(doc.data() as Omit<Listing, "id">),
        id: doc.id,
      }));

      const validListings = listings.filter(isValidListing);
      setSavedListings(validListings);
      saveListingsToCache(validListings);
    } catch (error) {
      console.error("Failed to refresh saved listings:", error);
      setSavedListings([]);
    } finally {
      setLoadingSavedListings(false);
    }
  };

  const addToSavedListingsCache = (listing: Listing) => {
    if (!isValidListing(listing)) return;

    const updatedListings = [
      ...savedListings.filter((item) => item.id !== listing.id),
      listing,
    ];

    setSavedListings(updatedListings);
    saveListingsToCache(updatedListings);
  };

  const removeFromSavedListingsCache = (listingId: string) => {
    if (!listingId) return;

    const updatedListings = savedListings.filter(
      (listing) => listing.id !== listingId
    );

    setSavedListings(updatedListings);
    saveListingsToCache(updatedListings);
  };

  const isListingSavedCache = (listingId?: string | null) => {
    if (!listingId) return false;

    return savedListings.some((listing) => listing.id === listingId);
  };

  useEffect(() => {
    initSavedListings();
  }, [authUser]);

  return (
    <SavedListingsContext.Provider
      value={{
        savedListings,
        loadingSavedListings,
        initSavedListings,
        addToSavedListingsCache,
        removeFromSavedListingsCache,
        isListingSavedCache,
      }}
    >
      {children}
    </SavedListingsContext.Provider>
  );
}

export function useSavedListingsCache() {
  const context = useContext(SavedListingsContext);

  if (!context) {
    throw new Error(
      "useSavedListingsCache must be used inside SavedListingsProvider"
    );
  }

  return context;
}
