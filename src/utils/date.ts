import { format, parseISO, isValid, differenceInCalendarDays } from 'date-fns';

/**
 * Returns today's date formatted as YYYY-MM-DD in Asia/Kolkata timezone.
 */
export function getTodayIST(): string {
  const now = new Date();
  // Adjust to IST (+5:30)
  const utcOffset = now.getTime() + now.getTimezoneOffset() * 60000;
  const istOffset = 5.5 * 3600000;
  const istDate = new Date(utcOffset + istOffset);
  return format(istDate, 'yyyy-MM-dd');
}

/**
 * Formats a date string (ISO or YYYY-MM-DD) into DD/MMM/YYYY (e.g., 14/Jun/2026)
 */
export function formatDisplayDate(dateInput: string | Date | undefined): string {
  if (!dateInput) return '-';
  try {
    const d = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;
    if (!isValid(d)) return typeof dateInput === 'string' ? dateInput : '-';
    return format(d, 'dd/MMM/yyyy');
  } catch {
    return String(dateInput);
  }
}

/**
 * Formats date into DD/MM/YYYY (matching paper ledger format: 14/06/2026)
 */
export function formatLedgerDate(dateInput: string | Date | undefined): string {
  if (!dateInput) return '-';
  try {
    const d = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;
    if (!isValid(d)) return typeof dateInput === 'string' ? dateInput : '-';
    return format(d, 'dd/MM/yyyy');
  } catch {
    return String(dateInput);
  }
}

/**
 * Formats date into short format DD/MM/YY (e.g., 14/06/26 matching handwriting: 14/6/26)
 */
export function formatShortDate(dateInput: string | Date | undefined): string {
  if (!dateInput) return '-';
  try {
    const d = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;
    if (!isValid(d)) return typeof dateInput === 'string' ? dateInput : '-';
    return format(d, 'dd/MM/yy');
  } catch {
    return String(dateInput);
  }
}

/**
 * Checks if a given date string is today (IST).
 */
export function isToday(dateStr: string): boolean {
  if (!dateStr) return false;
  return dateStr.startsWith(getTodayIST());
}

/**
 * Formats a date string (ISO or YYYY-MM-DD) into uppercase DD-MMM-YYYY (e.g., 23-SEP-2026)
 */
export function formatUpperDate(dateInput: string | Date | undefined): string {
  if (!dateInput) return '-';
  try {
    const d = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;
    if (!isValid(d)) return typeof dateInput === 'string' ? dateInput.toUpperCase() : '-';
    return format(d, 'dd-MMM-yyyy').toUpperCase();
  } catch {
    return String(dateInput).toUpperCase();
  }
}

/**
 * Adds N days to a YYYY-MM-DD date string and returns the new date string.
 */
export function addDaysToDate(dateStr: string, days: number): string {
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return dateStr;
    const res = new Date(d);
    res.setDate(res.getDate() + days);
    return format(res, 'yyyy-MM-dd');
  } catch {
    return dateStr;
  }
}

/**
 * Returns number of days between two YYYY-MM-DD date strings (d2 - d1).
 */
export function getDaysDiff(d1Str: string, d2Str: string): number {
  try {
    const d1 = new Date(d1Str.substring(0, 10));
    const d2 = new Date(d2Str.substring(0, 10));
    const diffTime = d2.getTime() - d1.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

/**
 * Returns human-friendly relative time for last active date (e.g., 'आज (02:30 PM)', 'कल (03:37 PM)', '3 दिन पहले')
 * Uses calendar day boundaries to accurately distinguish between 'आज' (Today) and 'कल' (Yesterday).
 */
export function formatRelativeActivity(dateInput?: string | Date, language: 'hi' | 'en' = 'hi'): string {
  if (!dateInput) return language === 'hi' ? 'कोई लेन-देन नहीं' : 'No entries yet';
  try {
    const d = typeof dateInput === 'string'
      ? (isValid(parseISO(dateInput)) ? parseISO(dateInput) : new Date(dateInput))
      : dateInput;
    if (!isValid(d)) return typeof dateInput === 'string' ? dateInput : '-';

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const calendarDays = differenceInCalendarDays(now, d);

    const hasTime = typeof dateInput === 'string'
      ? (dateInput.includes('T') || dateInput.includes(':'))
      : true;
    const timeFormatted = hasTime ? format(d, 'hh:mm a') : '';

    if (calendarDays <= 0) {
      if (diffMs < 60 * 1000) {
        return language === 'hi' ? 'अभी-अभी' : 'Just now';
      } else if (diffMs < 3600 * 1000) {
        const mins = Math.max(1, Math.floor(diffMs / 60000));
        return language === 'hi' ? `${mins} मिनट पहले` : `${mins}m ago`;
      } else {
        return language === 'hi'
          ? (hasTime ? `आज (${timeFormatted})` : 'आज')
          : (hasTime ? `Today (${timeFormatted})` : 'Today');
      }
    } else if (calendarDays === 1) {
      return language === 'hi'
        ? (hasTime ? `कल (${timeFormatted})` : 'कल')
        : (hasTime ? `Yesterday (${timeFormatted})` : 'Yesterday');
    } else if (calendarDays < 7) {
      return language === 'hi' ? `${calendarDays} दिन पहले` : `${calendarDays}d ago`;
    } else {
      return format(d, 'dd/MMM/yyyy');
    }
  } catch {
    return typeof dateInput === 'string' ? dateInput : '-';
  }
}
