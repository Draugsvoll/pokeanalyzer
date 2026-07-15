import type { serverTimestamp } from "firebase/firestore";
import type { TimestampLike } from "../utils/timestamp";

export type UserCreatedAt = Exclude<TimestampLike, null | undefined>;

export type UserProfile = {
  uid: string;
  email: string;
  firstName?: string;
  createdAt?: UserCreatedAt;
  /** Legacy field retained for existing profiles. */
  username?: string;
  /** Legacy field retained for existing profiles. */
  avatar?: string | null;
};

export type UserUpload = Pick<UserProfile, "uid" | "email" | "firstName"> & {
  createdAt: ReturnType<typeof serverTimestamp>;
};
