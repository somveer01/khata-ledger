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

const ONES_HI: Record<number, string> = {
  0: 'शून्य', 1: 'एक', 2: 'दो', 3: 'तीन', 4: 'चार', 5: 'पाँच', 6: 'छह', 7: 'सात', 8: 'आठ', 9: 'नौ',
  10: 'दस', 11: 'ग्यारह', 12: 'बारह', 13: 'तेरह', 14: 'चौदह', 15: 'पंद्रह', 16: 'सोलह', 17: 'सत्रह', 18: 'अठारह', 19: 'उन्नीस',
  20: 'बीस', 21: 'इक्कीस', 22: 'बाईस', 23: 'तेईस', 24: 'चौबीस', 25: 'पच्चीस', 26: 'छब्बीस', 27: 'सत्ताईस', 28: 'अट्ठाईस', 29: 'उनतीस',
  30: 'तीस', 31: 'इकतीस', 32: 'बत्तीस', 33: 'तैंतीस', 34: 'चौंतीस', 35: 'पैंतीस', 36: 'छत्तीस', 37: 'सैंतीस', 38: 'अड़तीस', 39: 'उनतालीस',
  40: 'चालीस', 41: 'इकतालीस', 42: 'बयालीस', 43: 'तैंतालीस', 44: 'चवालीस', 45: 'पैंतालीस', 46: 'छियालीस', 47: 'सैंतालीस', 48: 'अड़तालीस', 49: 'उनचास',
  50: 'पचास', 51: 'इक्यावन', 52: 'बावन', 53: 'तिरेपन', 54: 'चौवन', 55: 'पचपन', 56: 'छप्पन', 57: 'सत्तावन', 58: 'अट्ठावन', 59: 'उनसठ',
  60: 'साठ', 61: 'इकसठ', 62: 'बासठ', 63: 'तिरेसठ', 64: 'चौंसठ', 65: 'पैंसठ', 66: 'छियासठ', 67: 'सरसठ', 68: 'अड़सठ', 69: 'उनहत्तर',
  70: 'सत्तर', 71: 'इकहत्तर', 72: 'बहत्तर', 73: 'तिहत्तर', 74: 'चौहत्तर', 75: 'पचहत्तर', 76: 'छिहत्तर', 77: 'सतहत्तर', 78: 'अठहत्तर', 79: 'उनासी',
  80: 'अस्सी', 81: 'इक्यासी', 82: 'बयासी', 83: 'तिरासी', 84: 'चौरासी', 85: 'पचासी', 86: 'छियासी', 87: 'सत्तासी', 88: 'अट्ठासी', 89: 'नवासी',
  90: 'नब्बे', 91: 'इक्यानवे', 92: 'बानवे', 93: 'तिरानवे', 94: 'चौरानवे', 95: 'पंचानवे', 96: 'छियानवे', 97: 'सत्तानवे', 98: 'अट्ठानवे', 99: 'निन्यानवे'
};

const ONES_EN = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
];
const TENS_EN = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertUnderHundredEn(n: number): string {
  if (n < 20) return ONES_EN[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return TENS_EN[tens] + (ones > 0 ? ' ' + ONES_EN[ones] : '');
}

function convertUnderThousandEn(n: number): string {
  let str = '';
  if (n >= 100) {
    str += ONES_EN[Math.floor(n / 100)] + ' Hundred ';
    n %= 100;
  }
  if (n > 0) {
    str += convertUnderHundredEn(n);
  }
  return str.trim();
}

function numberToWordsEn(rupees: number): string {
  if (rupees === 0) return 'Zero';
  let res = '';
  const crore = Math.floor(rupees / 10000000);
  rupees %= 10000000;
  const lakh = Math.floor(rupees / 100000);
  rupees %= 100000;
  const thousand = Math.floor(rupees / 1000);
  rupees %= 1000;
  const hundreds = rupees;

  if (crore > 0) res += convertUnderThousandEn(crore) + ' Crore ';
  if (lakh > 0) res += convertUnderHundredEn(lakh) + ' Lakh ';
  if (thousand > 0) res += convertUnderHundredEn(thousand) + ' Thousand ';
  if (hundreds > 0) res += convertUnderThousandEn(hundreds) + ' ';

  return res.trim();
}

function numberToWordsHi(rupees: number): string {
  if (rupees === 0) return 'शून्य';
  let res = '';
  const crore = Math.floor(rupees / 10000000);
  rupees %= 10000000;
  const lakh = Math.floor(rupees / 100000);
  rupees %= 100000;
  const thousand = Math.floor(rupees / 1000);
  rupees %= 1000;
  const hundred = Math.floor(rupees / 100);
  const rem = rupees % 100;

  if (crore > 0) res += (ONES_HI[crore] || crore.toString()) + ' करोड़ ';
  if (lakh > 0) res += (ONES_HI[lakh] || lakh.toString()) + ' लाख ';
  if (thousand > 0) res += (ONES_HI[thousand] || thousand.toString()) + ' हज़ार ';
  if (hundred > 0) res += (ONES_HI[hundred] || hundred.toString()) + ' सौ ';
  if (rem > 0) res += (ONES_HI[rem] || rem.toString()) + ' ';

  return res.trim();
}

/**
 * Converts integer paise into Indian currency words in Hindi and English.
 * e.g., "बारह हज़ार पाँच सौ रुपये मात्र (Twelve Thousand Five Hundred Rupees Only)"
 */
export function amountInWords(paise: CurrencyPaise): string {
  const isNeg = paise < 0;
  const absPaise = Math.abs(Math.round(paise));
  const rupees = Math.floor(absPaise / 100);
  const remPaise = absPaise % 100;

  if (rupees === 0 && remPaise === 0) {
    return 'शून्य रुपये मात्र (Zero Rupees Only)';
  }

  const hiWords = numberToWordsHi(rupees);
  const enWords = numberToWordsEn(rupees);

  let hiFull = `${hiWords} रुपये`;
  let enFull = `${enWords} Rupees`;

  if (remPaise > 0) {
    hiFull += ` व ${ONES_HI[remPaise] || remPaise} पैसे`;
    enFull += ` and ${convertUnderHundredEn(remPaise)} Paise`;
  }

  hiFull += ' मात्र';
  enFull += ' Only';

  if (isNeg) {
    return `${hiFull} अग्रिम/जमा (Advance: ${enFull})`;
  }

  return `${hiFull} (${enFull})`;
}
