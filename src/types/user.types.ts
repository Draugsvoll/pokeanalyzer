import type { serverTimestamp } from "firebase/firestore";

export type UserCreatedAt =
  | { toDate?: () => Date }
  | { seconds?: number }
  | string;

export type UserProfile = {
  uid?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  city?: string;
  address?: string;
  avatar?: string | null;
  createdAt?: UserCreatedAt;
};

export type UserUpload = Omit<UserProfile, "createdAt"> & {
  uid: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  city: string;
  address: string;
  avatar?: string | null;
  createdAt: ReturnType<typeof serverTimestamp>;
};
