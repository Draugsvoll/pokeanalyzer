import {
  MY_LISTINGS_CACHE_KEY,
  MY_SAVED_LISTINGS_CACHE_KEY,
  USER_PORTFOLIO_CACHE_KEY,
} from "../constants/cache";

export const getPortfolioCacheKey = (uid: string) =>
  `${USER_PORTFOLIO_CACHE_KEY}_${uid}`;

export const getMySavedListingsCacheKey = (uid: string) =>
  `${MY_SAVED_LISTINGS_CACHE_KEY}_${uid}`;

export const getMyListingsCacheKey = (uid: string) =>
  `${MY_LISTINGS_CACHE_KEY}_${uid}`;

export const getUserProfileSessionKey = (uid: string) =>
  `user_profile_${uid}`;
