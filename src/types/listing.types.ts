import type { serverTimestamp, Timestamp } from "firebase/firestore";

// Fields the user fills in
export type ListingInput = {
  title: string;
  price: number;
  description: string;
  images: string[];
};

// Fields the app adds before upload
export type ListingUpload = ListingInput & {
  userId: string;
  userName: string | null;
  userAvatar?: string | null;
  createdAt: ReturnType<typeof serverTimestamp>;
};

export type ListingBid = {
  id?: string;
  listingId: string;
  listingTitle: string;
  listingPrice: number;
  sellerId: string;
  bidderId: string;
  bidderName: string | null;
  amount: number;
  createdAt: Timestamp;
  status: "active" | "withdrawn" | "accepted" | "rejected";
};

// Fields stored in Firestore
export type ListingDoc = Omit<ListingUpload, "createdAt"> & {
  createdAt: Timestamp;
  highestBidAmount?: number;
  highestBidderId?: string | null;
  bidCount?: number;
};

// Fields your React app uses
export type Listing = ListingDoc & {
  id: string;
};
