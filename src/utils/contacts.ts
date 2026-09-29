import { Linking, Platform } from 'react-native';
import { showAlert } from './dialog';

/**
 * Utility to clean and format Indian 10-digit mobile numbers.
 * Handles:
 * - Accidental letter 'o' or 'O' typed/OCR'd in place of digit '0' (e.g. 'o9876543210' -> '9876543210')
 * - International prefix '+91' or '91' (e.g. '+91 9721204040' -> '9721204040')
 * - Trunk prefix '0' (e.g. '09721204040' -> '9721204040')
 * - Combined prefix '+91 0' or '910' (e.g. '+91 09721204040' -> '9721204040')
 * - Spaces, dashes, brackets, and extra leading/trailing symbols
 */
export function sanitizeIndianPhoneNumber(rawNumber: string): string {
  if (!rawNumber) return '';

  // 1. Convert common typo letter 'o' or 'O' to digit '0'
  let cleaned = rawNumber.replace(/[oO]/g, '0');

  // 2. Remove all non-numeric characters
  let digits = cleaned.replace(/\D/g, '');
  if (!digits) return '';

  // 3. Handle Indian prefixes
  // Combined prefix: 910... (13 digits: e.g. +91 09876543210)
  if (digits.length === 13 && digits.startsWith('910')) {
    digits = digits.slice(3);
  }
  // Standard country code: 91... (12 digits: e.g. +91 9876543210 or 919876543210)
  else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  // Standard trunk prefix: 0... (11 digits: e.g. 09876543210)
  else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  // If more than 10 digits (e.g. 0091...), take the last 10 digits
  else if (digits.length > 10) {
    digits = digits.slice(-10);
  }

  return digits;
}

/**
 * Initiates a phone call to the given customer mobile number.
 * Cross-platform (iOS, Android, and Web PWA).
 */
export async function callPhoneNumber(rawMobile: string, customerName?: string): Promise<void> {
  const clean = sanitizeIndianPhoneNumber(rawMobile);
  if (!clean || clean.length < 10) {
    showAlert(
      'कॉल त्रुटि (Call Error)',
      customerName
        ? `${customerName} का कोई वैध 10 अंकों का मोबाइल नंबर नहीं है।`
        : 'कोई वैध 10 अंकों का मोबाइल नंबर उपलब्ध नहीं है।',
      undefined,
      'warning'
    );
    return;
  }

  const telUrl = `tel:${clean}`;
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.location.href = telUrl;
      }
      return;
    }

    const canOpen = await Linking.canOpenURL(telUrl);
    if (canOpen) {
      await Linking.openURL(telUrl);
    } else {
      showAlert(
        'कॉल अनुपलब्ध',
        `इस डिवाइस पर फोन डायलर उपलब्ध नहीं है: ${clean}`,
        undefined,
        'info'
      );
    }
  } catch (err: any) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = telUrl;
    } else {
      showAlert(
        'कॉल त्रुटि',
        `डायलर खोलने में विफल: ${err.message || clean}`,
        undefined,
        'danger'
      );
    }
  }
}

/**
 * Parses freeform text (e.g. copied from WhatsApp, SMS or address book)
 * into a name and 10-digit phone number.
 */
export function parseContactText(text: string): { name: string; mobile: string } {
  if (!text || !text.trim()) {
    return { name: '', mobile: '' };
  }

  const trimmed = text.trim();

  // Pattern matching full phone representation (including +91, 0, o, O, spaces, hyphens)
  const phonePattern = /(?:\+?\s*91[\s-]*)?(?:[0oO][\s-]*)?[6-9]\d(?:\s*|\-*)?\d{3}(?:\s*|\-*)?\d{5}|(?:\+?\s*91[\s-]*)?(?:[0oO][\s-]*)?\d{5}(?:\s*|\-*)?\d{5}/i;
  const match = trimmed.match(phonePattern);

  let mobile = '';
  let name = trimmed;

  if (match) {
    const rawMatch = match[0];
    mobile = sanitizeIndianPhoneNumber(rawMatch);
    name = trimmed.replace(rawMatch, '').trim();
    name = name.replace(/^[\s,:+|\-()"]+|[\s,:+|\-()"]+$/g, '').trim();
  } else {
    const cleanedDigits = sanitizeIndianPhoneNumber(trimmed);
    if (cleanedDigits.length === 10) {
      mobile = cleanedDigits;
      name = trimmed.replace(/[\d+\-():+oO]+/gi, '').trim();
      name = name.replace(/^[\s,:+|\-()"]+|[\s,:+|\-()"]+$/g, '').trim();
    }
  }

  return { name, mobile };
}

/**
 * Checks if the W3C Contact Picker API is supported in the current environment
 */
export function isContactPickerSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    'ContactsManager' in window &&
    typeof (navigator as any).contacts?.select === 'function'
  );
}

/**
 * Prompts user to select a contact using the Web Contact Picker API
 */
export async function pickContactFromDevice(): Promise<{ name: string; mobile: string } | null> {
  if (!isContactPickerSupported()) {
    return null;
  }

  try {
    const props = ['name', 'tel'];
    const opts = { multiple: false };
    const contacts = await (navigator as any).contacts.select(props, opts);
    if (!contacts || contacts.length === 0) {
      return null;
    }

    const contact = contacts[0];
    const rawName = Array.isArray(contact.name) && contact.name.length > 0 ? contact.name[0] : (contact.name || '');
    const rawTel = Array.isArray(contact.tel) && contact.tel.length > 0 ? contact.tel[0] : (contact.tel || '');

    return {
      name: (rawName || '').trim(),
      mobile: sanitizeIndianPhoneNumber(rawTel),
    };
  } catch (err: any) {
    // User cancelled or browser rejected
    if (err?.name !== 'AbortError') {
      console.log('Contact picker notice:', err);
    }
    return null;
  }
}
