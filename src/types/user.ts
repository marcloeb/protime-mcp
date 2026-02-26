// User Types

export interface User {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  tier: 'free' | 'pro' | 'enterprise';
  firebaseUid?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSession {
  userId: string;
  chatgptUserId?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

export interface UserLimits {
  maxBriefings: number;
  maxEditionHistory: number;
  dailySchedule: boolean;
  advancedSources: boolean;
}

export const FREE_TIER_LIMITS: UserLimits = {
  maxBriefings: 1,
  maxEditionHistory: 1,  // Only latest edition
  dailySchedule: false,
  advancedSources: false,
};

export const PRO_TIER_LIMITS: UserLimits = {
  maxBriefings: Infinity,
  maxEditionHistory: 30,  // 30 days
  dailySchedule: true,
  advancedSources: true,
};
