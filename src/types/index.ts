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
  ownerEmail?: string;
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

export interface StoreActivityStats {
  business: Business;
  customerCount: number;
  villageCount: number;
  creditSaleCount: number;
  paymentCount: number;
  totalTransactionCount: number;
  lastActiveDate?: string;
  isActive: boolean;
  totalOutstandingPaise: CurrencyPaise;
  productCount?: number;
}

export type ProductCategory =
  | 'PESTICIDE'
  | 'INSECTICIDE'
  | 'FUNGICIDE'
  | 'HERBICIDE'
  | 'SEED'
  | 'FERTILIZER'
  | 'OTHER';

export interface Product {
  id: string;
  businessId: string;
  brandName: string;
  productName: string;
  technicalName?: string;
  category: ProductCategory;
  packSize: string; // e.g. "400 ML", "1 KG", "1 Litre"
  casePacking?: string; // e.g. "400ML*20 PCS", "10 LIT"
  unitsPerCase?: number; // e.g. 20 (pieces per box/case)
  caseVolumeOrWeight?: string; // e.g. "8 Litre", "10 Litre"
  primarySellingUnit?: string; // e.g. "Bottle", "Piece", "Bag"
  purchasePackagingUnit?: string; // e.g. "Box", "Case", "Bag"
  unit?: string; // "Bottle", "Pouch", "Bag", "Litre", "Kg", "Unit"
  uomId?: string; // Reference to UnitOfMeasurement (e.g. "uom_box", "uom_btl")
  purchaseUomId?: string; // Optional purchase packaging UOM (e.g. "uom_box")
  conversionFactor?: number; // e.g. 10 (1 Box = 10 Bottles)
  billingRatePaise: CurrencyPaise; // purchase price without GST
  gstPercent: number; // e.g. 18, 12, 5, 0
  withGstRatePaise: CurrencyPaise; // billingRate + GST
  marginPercent?: number; // profit margin % over withGstRate
  sellingRatePaise: CurrencyPaise; // customer selling price
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type UOMCategory = 'COUNT' | 'WEIGHT' | 'VOLUME' | 'PACKAGING';

export interface UnitOfMeasurement {
  id: string; // e.g. "uom_kg", "uom_box", "uom_pc"
  businessId: string;
  code: string; // "KG", "BOX", "PKT", "PC", "BTL", "BAG", "LTR", "GM", "ML", "QNTL"
  nameHi: string; // "किलोग्राम", "पेटी / बॉक्स", "पैकेट", "नग / पीस", "बोतल"
  nameEn: string; // "Kilogram", "Box", "Packet", "Piece", "Bottle"
  category: UOMCategory;
  isBaseUnit?: boolean;
  isSystemDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UnitConversion {
  id: string; // e.g. "conv_box_pc"
  businessId: string;
  fromUOMId: string; // Higher packaging UOM ID (e.g. "uom_box")
  fromUOMCode?: string; // Denormalized for fast display (e.g. "BOX")
  toUOMId: string; // Base/lower UOM ID (e.g. "uom_pc")
  toUOMCode?: string; // Denormalized (e.g. "PC")
  conversionFactor: number; // 1 fromUOM = conversionFactor toUOM (e.g. 1 BOX = 10 PC)
  description?: string; // e.g. "1 पेटी = 10 पैकेट"
  productId?: string; // Optional product-specific conversion rule
  productName?: string; // Denormalized product name
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string; // e.g. "sup_173..."
  businessId: string;
  name: string; // Dealer / Vendor / Company name (e.g. "श्रीराम कृषि केंद्र", "बायर डिस्ट्रीब्यूटर")
  contactPerson?: string;
  phone: string;
  address?: string;
  gstin?: string;
  totalPurchasePaise: CurrencyPaise;
  totalPaidPaise: CurrencyPaise;
  currentOutstandingPaise: CurrencyPaise; // Unpaid balance due to supplier
  notes?: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

export interface SupplierPayment {
  id: string; // "sup_pay_..."
  businessId: string;
  supplierId: string;
  supplierName?: string;
  amountPaise: CurrencyPaise;
  paymentMethod: PaymentMethod;
  referenceNo?: string; // UPI ref, Cheque no, bank ref
  date: string; // YYYY-MM-DD
  notes?: string;
  createdAt: string;
}

export interface PurchaseItemDetail {
  productId: string;
  productName: string;
  brandName: string;
  category: ProductCategory;
  packSize: string; // e.g. "250 ML"
  purchaseQty: number; // e.g. 2 (Boxes) or 10 (Bottles)
  purchaseUnit: string; // "BOX" or "BTL"
  unitsPerPack: number; // e.g. 40 (if 1 Box = 40 Bottles), or 1 if buying loose bottles
  totalBaseUnits: number; // e.g. 2 x 40 = 80 Bottles (quantity added to stock)
  baseUnit: string; // e.g. "BTL" or "PC"
  billingRatePaise: CurrencyPaise; // Rate per base unit
  gstPercent: number;
  withGstRatePaise: CurrencyPaise;
  totalPaise: CurrencyPaise; // Total cost for this line item
}

export interface PurchaseInvoice {
  id: string; // "pur_..."
  businessId: string;
  supplierId: string;
  supplierName: string;
  invoiceNo?: string; // e.g. "INV-2026-904"
  invoiceDate: string; // YYYY-MM-DD
  items: PurchaseItemDetail[];
  subtotalPaise: CurrencyPaise;
  gstAmountPaise: CurrencyPaise;
  totalAmountPaise: CurrencyPaise;
  paidAmountPaise: CurrencyPaise;
  dueAmountPaise: CurrencyPaise; // Credit amount added to supplier's ledger
  paymentStatus: 'PAID' | 'UNPAID' | 'PARTIAL';
  paymentMethod?: PaymentMethod;
  isGstInvoice?: boolean; // true = GST Bill, false = Non-GST (बिना जीएसटी / कच्चा बिल)
  billPhotoUri?: string; // Camera photo or document URI
  billFileName?: string; // e.g. "invoice.pdf" or "bill_photo.jpg"
  billFileType?: 'image' | 'pdf'; // Type for visual rendering
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockItemSummary {
  productId: string;
  productName: string;
  brandName: string;
  category: ProductCategory;
  packSize: string;
  casePacking?: string;
  unitsPerCase: number; // e.g. 40
  caseVolumeOrWeight?: string; // e.g. "10 Litre"
  sellingUnit: string; // "BTL", "PC", "KG"
  purchasePackagingUnit: string; // "BOX", "BAG"
  totalPurchasedBaseUnits: number;
  totalSoldBaseUnits: number;
  totalAdjustedBaseUnits?: number; // Net physical adjustments (+ surplus / - damage)
  currentStockBaseUnits: number; // purchased - sold + adjustments
  currentStockCases: number; // Math.floor(currentStockBaseUnits / unitsPerCase)
  currentStockLooseUnits: number; // currentStockBaseUnits % unitsPerCase
  unitCostPaise: CurrencyPaise; // purchase with-gst rate
  totalStockValuePaise: CurrencyPaise; // currentStockBaseUnits * unitCostPaise
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export type StockAdjustmentType =
  | 'DAMAGE'        // टूट-फूट / डैमेज (-)
  | 'EXPIRY'        // एक्सपायर (-)
  | 'THEFT_LOSS'    // चोरी / नुकसान (-)
  | 'AUDIT_SURPLUS' // गिनती में अधिक (+)
  | 'AUDIT_SHORT'   // गिनती में कमी (-)
  | 'MANUAL_IN'     // अन्य आवक (+)
  | 'MANUAL_OUT';   // अन्य जावक (-)

export interface StockAdjustment {
  id: string; // "adj_..."
  businessId: string;
  productId: string;
  productName: string;
  brandName?: string;
  adjustmentType: StockAdjustmentType;
  quantityBaseUnits: number; // Absolute positive number
  unit: string; // e.g. "BTL", "PC", "KG"
  reason?: string;
  date: string; // YYYY-MM-DD
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// DAY-END CASH DRAWER & DAILY RECONCILIATION
// ----------------------------------------------------------------------------
export interface CashDenomination {
  note500: number; // ₹500
  note200: number; // ₹200
  note100: number; // ₹100
  note50: number;  // ₹50
  note20: number;  // ₹20
  note10: number;  // ₹10
  coins: number;   // सिक्कों की कुल राशि (रुपयों में)
}

export type DailyExpenseCategory =
  | 'TEA_SNACKS'        // चाय / नाश्ता
  | 'LABOUR_LOADING'    // पल्लेदारी / मजदूरी
  | 'FREIGHT_TRANSPORT' // भाड़ा / ढुलाई
  | 'ELECTRICITY_FUEL'  // बिजली / डीज़ल / पेट्रोल
  | 'PERSONAL_DRAWING'  // मालिक द्वारा निजी खर्च
  | 'OTHER';            // अन्य दुकान खर्चा

export interface DailyExpenseItem {
  id: string;
  businessId: string;
  date: string; // YYYY-MM-DD
  category: DailyExpenseCategory;
  title: string;
  amountPaise: CurrencyPaise;
  paymentMethod: 'CASH' | 'UPI';
  paidTo?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface DailyCashClosing {
  id: string;                   // "close_YYYY-MM-DD"
  businessId: string;
  date: string;                 // YYYY-MM-DD
  closedAt: string;             // ISO Timestamp
  closedBy?: string;            // User Name / Owner / Munim

  // 1. Cash Opening & Movements
  openingCashPaise: CurrencyPaise;
  cashSalesPaise: CurrencyPaise;
  cashRecoveriesPaise: CurrencyPaise;
  cashSupplierPaidPaise: CurrencyPaise;
  cashExpensesPaise: CurrencyPaise;
  expectedCashPaise: CurrencyPaise;

  // 2. Physical Count & Variance
  denominations: CashDenomination;
  physicalCashPaise: CurrencyPaise;
  variancePaise: CurrencyPaise;         // physicalCashPaise - expectedCashPaise
  varianceReason?: string;             // अंतर का कारण

  // 3. Non-Cash & Business Totals
  upiSalesPaise: CurrencyPaise;
  upiRecoveriesPaise: CurrencyPaise;
  upiExpensesPaise: CurrencyPaise;
  creditSalesPaise: CurrencyPaise;     // आज की कुल उधारी
  totalDaySalesPaise: CurrencyPaise;   // कुल बिक्री (Cash + UPI + Credit)
  totalDayCollectionsPaise: CurrencyPaise; // कुल वसूली (Cash + UPI)

  // 4. Status & Lock
  isLocked: boolean;            // क्लोज़िंग लॉक
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

