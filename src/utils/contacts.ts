/**
 * Utility to clean and format Indian 10-digit mobile numbers
 */
export function sanitizeIndianPhoneNumber(rawNumber: string): string {
  if (!rawNumber) return '';
  // Remove all non-numeric characters
  const digits = rawNumber.replace(/\D/g, '');
  if (!digits) return '';

  // If 12 digits and starts with 91, strip 91
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  // If 11 digits and starts with 0, strip 0
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  // If more than 10 digits, take the last 10
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
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

  // Pattern matching full phone representation (including +91, 0, spaces, hyphens)
  const phonePattern = /(?:\+?\s*91[\s-]*)?(?:0[\s-]*)?[6-9]\d(?:\s*|\-*)?\d{3}(?:\s*|\-*)?\d{5}|(?:\+?\s*91[\s-]*)?(?:0[\s-]*)?\d{5}(?:\s*|\-*)?\d{5}/;
  const match = trimmed.match(phonePattern);

  let mobile = '';
  let name = trimmed;

  if (match) {
    const rawMatch = match[0];
    mobile = sanitizeIndianPhoneNumber(rawMatch);
    name = trimmed.replace(rawMatch, '').trim();
    name = name.replace(/^[\s,:+|\-()"]+|[\s,:+|\-()"]+$/g, '').trim();
  } else {
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length >= 10) {
      mobile = sanitizeIndianPhoneNumber(digitsOnly);
      name = trimmed.replace(/[\d+\-():]+/g, '').trim();
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
