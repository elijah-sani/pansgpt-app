export type MainUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  level?: string;
  university?: string;
  subscriptionTier?: string;
} | null;

export type WebSearchUsage = {
  used: number;
  limit: number;
  remaining: number;
} | null;
