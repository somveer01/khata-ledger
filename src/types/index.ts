export type CurrencyPaise = number; // Integer paise: ₹1.00 = 100 paise

export type TransactionType = 'CREDIT_SALE' | 'PAYMENT' | 'OPENING_BALANCE' | 'ADJUSTMENT' | 'REVERSAL';

export type PaymentMethod = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';

export interface Business {
  id: string;
  name: string;
  ownerName: string;
  phone: string;
  address?: string;
  upiId?: string;
  currency: string; // 'INR'
  createdAt: string;
  updatedAt: string;
}

export interface Village {
  id: string;
  businessId: string;
  name: string;
  nameHindi?: string;
  notes?: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  businessId: string;
  name: string;
  mobile: string;
  villageId: string;
  villageName?: string; // Denormalized for display convenience
  address?: string;
  openingBalancePaise: CurrencyPaise; // Udhaar if positive, Advance if negative
  currentBalancePaise: CurrencyPaise; // Cached running balance
  totalCreditPaise?: CurrencyPaise;
  totalPaymentPaise?: CurrencyPaise;
  transactionCount?: number;
  dueDate?: string; // Latest / active pending payment due date (YYYY-MM-DD)
  notes?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  businessId: string;
  customerId: string;
  customerName?: string;
  villageName?: string;
  type: TransactionType;
  amountPaise: CurrencyPaise; // Always positive integer paise
  discountPaise?: CurrencyPaise; // Discount / Concession given upon payment (in paise)
  receivedAmountPaise?: CurrencyPaise; // Amount paid by customer at time of sale (in paise)
  dueDate?: string; // Payment Due Date (YYYY-MM-DD) for credit sales / udhaar
  description: string; // Item / Particulars (e.g. धान, डिसेस इमामेक्टीन)
  quantity?: number;
  unit?: string; // kg, bag, litre, packet, pc, etc.
  ratePaise?: CurrencyPaise; // Rate per unit in paise
  paymentMethod?: PaymentMethod;
  referenceNumber?: string; // Invoice / Receipt / UPI Ref
  notes?: string;
  date: string; // ISO string or YYYY-MM-DD
  runningBalancePaise?: CurrencyPaise; // Snapshot balance after this transaction
  idempotencyKey?: string;
  createdAt: string;
  createdBy?: string;
  isReversed?: boolean;
  reversalReason?: string;
}

export interface VillageSummary {
  villageId: string;
  villageName: string;
  customerCount: number;
  customersWithDueCount: number;
  totalCreditPaise: CurrencyPaise;
  totalPaymentPaise: CurrencyPaise;
  totalOutstandingPaise: CurrencyPaise;
}

export interface DashboardMetrics {
  totalOutstandingPaise: CurrencyPaise;
  todayCreditSalesPaise: CurrencyPaise;
  todayPaymentsReceivedPaise: CurrencyPaise;
  totalCustomers: number;
  customersWithDueCount: number;
  totalVillages: number;
  thisMonthCreditSalesPaise: CurrencyPaise;
  thisMonthPaymentsPaise: CurrencyPaise;
}

export interface DateFilterRange {
  startDate?: string;
  endDate?: string;
  preset?: 'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'CUSTOM';
}

export type SupportedLanguage = 'en' | 'hi';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName?: string | null;
  isGuest: boolean;
}
