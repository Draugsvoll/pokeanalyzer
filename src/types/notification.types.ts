import type { Timestamp } from "firebase/firestore";

export type NotificationType = "bid_received";

export type AppNotification = {
  id?: string;
  userId: string;
  type: NotificationType;
  listingId: string;
  listingTitle: string;
  bidId: string;
  bidAmount: number;
  bidderId: string;
  bidderName: string | null;
  read: boolean;
  createdAt: Timestamp;
};
