export const LEGACY_BUSINESS_ID = 'biz_default_1';
export const LEGACY_OWNER_EMAIL = 'sukhveersinghkush@gmail.com';
export const LEGACY_BUSINESS_TENANT_ID = 'biz_sukhveersinghkush_gmail_com';

/**
 * Deterministically derives a unique, safe businessId / tenant ID from a user email.
 * Legacy owner (Sukhveer) maps directly to 'biz_default_1' which holds the 98 customers and 31 villages.
 */
export const getBusinessIdFromEmail = (email: string): string => {
  if (isLegacyOwner(email)) {
    return LEGACY_BUSINESS_ID;
  }
  const clean = email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `biz_${clean}`;
};

/**
 * Checks if a given email is the primary owner of the legacy business data (Kushi kersi seva kendar).
 */
export const isLegacyOwner = (email: string | null | undefined): boolean => {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return clean.includes('sukhveer') || clean === LEGACY_OWNER_EMAIL.toLowerCase();
};

/**
 * Super Admin check: Only Somveer can view and switch between all stores and users.
 */
export const isSuperAdmin = (email: string | null | undefined): boolean => {
  if (!email) return false;
  return email.trim().toLowerCase().includes('somveerkushwaha');
};
