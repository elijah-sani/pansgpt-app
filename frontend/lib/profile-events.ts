export type ProfileUpdateDetail = {
  name?: string;
  firstName?: string;
  otherNames?: string;
  avatarUrl?: string;
  level?: string;
  university?: string;
  subscriptionTier?: string;
};

export const PROFILE_UPDATED_EVENT = 'pansgpt:profile-updated';

export function dispatchProfileUpdated(detail: ProfileUpdateDetail) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<ProfileUpdateDetail>(PROFILE_UPDATED_EVENT, { detail }));
}
