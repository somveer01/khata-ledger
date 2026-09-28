export const LEGACY_BUSINESS_ID = 'biz_default_1';
export const LEGACY_OWNER_EMAIL = 'somveerkushwaha@gmail.com';

/**
 * Deterministically derives a unique, safe businessId / tenant ID from a user email.
 * E.g., "somveerkushwaha@gmail.com" -> "biz_somveerkushwaha_gmail_com"
 */
export const getBusinessIdFromEmail = (email: string): string => {
  const clean = email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `biz_${clean}`;
};

/**
 * Checks if a given email is the primary owner of the legacy business data.
 */
export const isLegacyOwner = (email: string | null | undefined): boolean => {
  if (!email) return false;
  return email.trim().toLowerCase().includes('somveerkushwaha');
};
