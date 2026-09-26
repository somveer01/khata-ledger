import { CurrencyPaise } from '../types';

/**
 * Converts a rupee amount (string or number) into integer paise.
 * Rounds to nearest integer to avoid any fractional precision issues.
 */
export function toPaise(rupees: number | string): CurrencyPaise {
  if (typeof rupees === 'string') {
    const cleanStr = rupees.replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleanStr);
    if (isNaN(num)) return 0;
    return Math.round(num * 100);
  }
  if (isNaN(rupees) || !isFinite(rupees)) return 0;
  return Math.round(rupees * 100);
}

/**
 * Converts integer paise into floating rupees for calculations where needed.
 */
export function toRupees(paise: CurrencyPaise): number {
  if (isNaN(paise) || !isFinite(paise)) return 0;
  return Math.round(paise) / 100;
}

/**
 * Formats integer paise into Indian Rupee format (e.g., ₹1,50,250 or ₹1,50,250.50)
 * Uses Indian numbering grouping (lakhs, crores: 3, 2, 2 digits)
 */
export function formatCurrency(
  paise: CurrencyPaise,
  options?: {
    showDecimals?: boolean;
    showSign?: boolean;
    prefix?: string;
  }
): string {
  const { showDecimals = false, showSign = false, prefix = '₹' } = options || {};
  
  if (isNaN(paise) || !isFinite(paise)) {
    return `${prefix}0`;
  }

  const isNegative = paise < 0;
  const absPaise = Math.abs(Math.round(paise));
  const rupeesPart = Math.floor(absPaise / 100);
  const paisePart = absPaise % 100;

  // Format integer part with Indian commas (last 3, then groups of 2)
  const rupeeStr = rupeesPart.toString();
  let formattedRupees = '';
  
  if (rupeeStr.length > 3) {
    const lastThree = rupeeStr.substring(rupeeStr.length - 3);
    const remaining = rupeeStr.substring(0, rupeeStr.length - 3);
    const withCommas = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    formattedRupees = `${withCommas},${lastThree}`;
  } else {
    formattedRupees = rupeeStr;
  }

  let result = formattedRupees;
  if (showDecimals || paisePart > 0) {
    result += `.${paisePart.toString().padStart(2, '0')}`;
  }

  if (isNegative) {
    return `-${prefix}${result}`;
  }
  if (showSign && paise > 0) {
    return `+${prefix}${result}`;
  }
  return `${prefix}${result}`;
}

/**
 * Validates whether an amount in paise is a valid positive financial value.
 */
export function isValidAmount(paise: CurrencyPaise): boolean {
  return Number.isInteger(paise) && paise > 0 && paise < 10000000000; // up to 10 crore
}
