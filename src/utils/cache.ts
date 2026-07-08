import { USER_PORTFOLIO_CACHE_KEY } from "../constants/cache";

export const getPortfolioCacheKey = (uid: string) =>
  `${USER_PORTFOLIO_CACHE_KEY}_${uid}`;

export const getUserProfileSessionKey = (uid: string) =>
  `user_profile_${uid}`;