import { sanitizeIndianPhoneNumber, parseContactText } from '../src/utils/contacts';

describe('Contacts Utility Tests', () => {
  describe('sanitizeIndianPhoneNumber', () => {
    test('cleans 10-digit number correctly', () => {
      expect(sanitizeIndianPhoneNumber('9876543210')).toBe('9876543210');
    });

    test('cleans +91 formatted numbers with spaces and hyphens', () => {
      expect(sanitizeIndianPhoneNumber('+91 98765 43210')).toBe('9876543210');
      expect(sanitizeIndianPhoneNumber('+91-98765-43210')).toBe('9876543210');
      expect(sanitizeIndianPhoneNumber('+919876543210')).toBe('9876543210');
      expect(sanitizeIndianPhoneNumber('919876543210')).toBe('9876543210');
    });

    test('cleans 0-prefixed 11-digit numbers', () => {
      expect(sanitizeIndianPhoneNumber('09876543210')).toBe('9876543210');
    });

    test('handles empty or non-numeric input gracefully', () => {
      expect(sanitizeIndianPhoneNumber('')).toBe('');
      expect(sanitizeIndianPhoneNumber('abc')).toBe('');
    });
  });

  describe('parseContactText', () => {
    test('extracts name and 10-digit phone with +91', () => {
      const res = parseContactText('Ramesh Kumar +91 98765 43210');
      expect(res.name).toBe('Ramesh Kumar');
      expect(res.mobile).toBe('9876543210');
    });

    test('extracts phone first followed by name', () => {
      const res = parseContactText('9876543210 - Shyam Lal');
      expect(res.name).toBe('Shyam Lal');
      expect(res.mobile).toBe('9876543210');
    });

    test('extracts contact with colon separator and 0-prefixed number', () => {
      const res = parseContactText('Kushwaha Ji: 09876543210');
      expect(res.name).toBe('Kushwaha Ji');
      expect(res.mobile).toBe('9876543210');
    });

    test('handles text with only phone number', () => {
      const res = parseContactText('+91 98765 43210');
      expect(res.name).toBe('');
      expect(res.mobile).toBe('9876543210');
    });

    test('handles text with only name', () => {
      const res = parseContactText('Somveer Singh');
      expect(res.name).toBe('Somveer Singh');
      expect(res.mobile).toBe('');
    });
  });
});
