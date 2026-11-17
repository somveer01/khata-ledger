import AsyncStorage from '@react-native-async-storage/async-storage';
import { Business, Village, Customer, Transaction, AppUser, Product, UnitOfMeasurement, UnitConversion, Supplier, SupplierPayment, PurchaseInvoice, StockAdjustment, DailyExpenseItem, DailyCashClosing } from '../types';

const STORAGE_KEYS = {
  CURRENT_BUSINESS: '@khata_book_current_business',
  ALL_BUSINESSES: '@khata_book_all_businesses',
  VILLAGES: '@khata_book_villages',
  CUSTOMERS: '@khata_book_customers',
  TRANSACTIONS: '@khata_book_transactions',
  PRODUCTS: '@khata_book_products',
  UOMS: '@khata_book_uoms',
  UOM_CONVERSIONS: '@khata_book_uom_conversions',
  SUPPLIERS: '@khata_book_suppliers',
  PURCHASES: '@khata_book_purchases',
  SUPPLIER_PAYMENTS: '@khata_book_supplier_payments',
  STOCK_ADJUSTMENTS: '@khata_book_stock_adjustments',
  DAILY_EXPENSES: '@khata_book_daily_expenses',
  DAILY_CASH_CLOSINGS: '@khata_book_daily_cash_closings',
  PENDING_SYNC: '@khata_book_pending_sync',
  APP_LANGUAGE: '@khata_book_language',
  CURRENT_USER: '@khata_book_current_user',
  IS_GUEST: '@khata_book_is_guest',
  LOCAL_USERS: '@khata_book_local_users',
};

// High-speed in-memory L1 cache for instant (0ms) data retrieval
const memoryCache = new Map<string, any>();

// IndexedDB Attachment Store for large files (bill photos & PDFs) that would exceed localStorage 5MB quota
let idbPromise: Promise<IDBDatabase | null> | null = null;
function getAttachmentDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !(window as any).indexedDB) {
    return Promise.resolve(null);
  }
  if (!idbPromise) {
    idbPromise = new Promise((resolve) => {
      try {
        const req = (window as any).indexedDB.open('KhataBookAttachments', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('attachments')) {
            db.createObjectStore('attachments', { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn('IndexedDB open error:', req.error);
          resolve(null);
        };
      } catch (err) {
        console.warn('IndexedDB not available:', err);
        resolve(null);
      }
    });
  }
  return idbPromise;
}

export const AttachmentService = {
  async save(id: string, dataUri: string): Promise<void> {
    try {
      const db = await getAttachmentDB();
      if (!db) return;
      const tx = db.transaction('attachments', 'readwrite');
      tx.objectStore('attachments').put({ id, dataUri, updatedAt: Date.now() });
    } catch (e) {
      console.warn('Attachment save error:', e);
    }
  },

  async get(id: string): Promise<string | null> {
    try {
      const db = await getAttachmentDB();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction('attachments', 'readonly');
        const req = tx.objectStore('attachments').get(id);
        req.onsuccess = () => resolve(req.result?.dataUri || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.warn('Attachment get error:', e);
      return null;
    }
  },

  async remove(id: string): Promise<void> {
    try {
      const db = await getAttachmentDB();
      if (!db) return;
      const tx = db.transaction('attachments', 'readwrite');
      tx.objectStore('attachments').delete(id);
    } catch (e) {
      console.warn('Attachment remove error:', e);
    }
  },
};

export const StorageService = {
  // Clear all in-memory L1 cache (crucial on login/logout to prevent tenant data leakage)
  clearMemoryCache(): void {
    memoryCache.clear();
  },

  // Current Business
  async getCurrentBusiness(): Promise<Business | null> {
    if (memoryCache.has(STORAGE_KEYS.CURRENT_BUSINESS)) {
      return memoryCache.get(STORAGE_KEYS.CURRENT_BUSINESS);
    }
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_BUSINESS);
    const data = raw ? JSON.parse(raw) : null;
    if (data) memoryCache.set(STORAGE_KEYS.CURRENT_BUSINESS, data);
    return data;
  },

  async setCurrentBusiness(business: Business): Promise<void> {
    const key = `${STORAGE_KEYS.CURRENT_BUSINESS}_${business.id}`;
    memoryCache.set(key, business);
    memoryCache.set(STORAGE_KEYS.CURRENT_BUSINESS, business);
    await AsyncStorage.setItem(key, JSON.stringify(business));
    await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_BUSINESS, JSON.stringify(business));
  },

  async getBusiness(businessId: string): Promise<Business | null> {
    const key = `${STORAGE_KEYS.CURRENT_BUSINESS}_${businessId}`;
    if (memoryCache.has(key)) {
      return memoryCache.get(key);
    }
    const raw = await AsyncStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : null;
    if (data) memoryCache.set(key, data);
    return data;
  },

  async saveBusiness(business: Business): Promise<void> {
    await this.setCurrentBusiness(business);
  },

  // Language
  async getLanguage(): Promise<'en' | 'hi'> {
    if (memoryCache.has(STORAGE_KEYS.APP_LANGUAGE)) {
      return memoryCache.get(STORAGE_KEYS.APP_LANGUAGE);
    }
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.APP_LANGUAGE);
    const lang = raw === 'hi' ? 'hi' : 'en';
    memoryCache.set(STORAGE_KEYS.APP_LANGUAGE, lang);
    return lang;
  },

  async setLanguage(lang: 'en' | 'hi'): Promise<void> {
    memoryCache.set(STORAGE_KEYS.APP_LANGUAGE, lang);
    await AsyncStorage.setItem(STORAGE_KEYS.APP_LANGUAGE, lang);
  },

  // Villages
  async getVillages(businessId: string): Promise<Village[]> {
    const key = `${STORAGE_KEYS.VILLAGES}_${businessId}`;
    if (memoryCache.has(key)) {
      return [...memoryCache.get(key)];
    }
    const raw = await AsyncStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    memoryCache.set(key, list);
    return [...list];
  },

  async saveVillages(businessId: string, villages: Village[]): Promise<void> {
    const key = `${STORAGE_KEYS.VILLAGES}_${businessId}`;
    memoryCache.set(key, [...villages]);
    await AsyncStorage.setItem(key, JSON.stringify(villages));
  },

  // Customers
  async getCustomers(businessId: string): Promise<Customer[]> {
    const key = `${STORAGE_KEYS.CUSTOMERS}_${businessId}`;
    if (memoryCache.has(key)) {
      return [...memoryCache.get(key)];
    }
    const raw = await AsyncStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    memoryCache.set(key, list);
    return [...list];
  },

  async saveCustomers(businessId: string, customers: Customer[]): Promise<void> {
    const key = `${STORAGE_KEYS.CUSTOMERS}_${businessId}`;
    memoryCache.set(key, [...customers]);
    await AsyncStorage.setItem(key, JSON.stringify(customers));
  },

  // Transactions
  async getTransactions(businessId: string): Promise<Transaction[]> {
    const key = `${STORAGE_KEYS.TRANSACTIONS}_${businessId}`;
    if (memoryCache.has(key)) {
      return [...memoryCache.get(key)];
    }
    const raw = await AsyncStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    memoryCache.set(key, list);
    return [...list];
  },

  async saveTransactions(businessId: string, transactions: Transaction[]): Promise<void> {
    const key = `${STORAGE_KEYS.TRANSACTIONS}_${businessId}`;
    memoryCache.set(key, transactions);
    await AsyncStorage.setItem(key, JSON.stringify(transactions));
  },

  // Products
  async getProducts(businessId: string): Promise<Product[]> {
    const key = `${STORAGE_KEYS.PRODUCTS}_${businessId}`;
    if (memoryCache.has(key)) {
      return [...memoryCache.get(key)];
    }
    const raw = await AsyncStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    memoryCache.set(key, list);
    return [...list];
  },

  async saveProducts(businessId: string, products: Product[]): Promise<void> {
    const key = `${STORAGE_KEYS.PRODUCTS}_${businessId}`;
    memoryCache.set(key, [...products]);
    await AsyncStorage.setItem(key, JSON.stringify(products));
  },

  // Units of Measurement (UOM)
  async getUOMs(businessId: string): Promise<UnitOfMeasurement[]> {
    const key = `${STORAGE_KEYS.UOMS}_${businessId}`;
    if (memoryCache.has(key)) {
      return [...memoryCache.get(key)];
    }
    const raw = await AsyncStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    memoryCache.set(key, list);
    return [...list];
  },

  async saveUOMs(businessId: string, uoms: UnitOfMeasurement[]): Promise<void> {
    const key = `${STORAGE_KEYS.UOMS}_${businessId}`;
    memoryCache.set(key, [...uoms]);
    await AsyncStorage.setItem(key, JSON.stringify(uoms));
  },

  // Unit Conversions
  async getUOMConversions(businessId: string): Promise<UnitConversion[]> {
    const key = `${STORAGE_KEYS.UOM_CONVERSIONS}_${businessId}`;
    if (memoryCache.has(key)) {
      return [...memoryCache.get(key)];
    }
    const raw = await AsyncStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    memoryCache.set(key, list);
    return [...list];
  },

  async saveUOMConversions(businessId: string, conversions: UnitConversion[]): Promise<void> {
    const key = `${STORAGE_KEYS.UOM_CONVERSIONS}_${businessId}`;
    memoryCache.set(key, [...conversions]);
    await AsyncStorage.setItem(key, JSON.stringify(conversions));
  },

  // Suppliers (Dealers / Vendors)
  async getSuppliers(businessId: string): Promise<Supplier[]> {
    const key = `${STORAGE_KEYS.SUPPLIERS}_${businessId}`;
    if (memoryCache.has(key)) {
      return [...memoryCache.get(key)];
    }
    const raw = await AsyncStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    memoryCache.set(key, list);
    return [...list];
  },

  async saveSuppliers(businessId: string, suppliers: Supplier[]): Promise<void> {
    const key = `${STORAGE_KEYS.SUPPLIERS}_${businessId}`;
    memoryCache.set(key, [...suppliers]);
    await AsyncStorage.setItem(key, JSON.stringify(suppliers));
  },

  // Purchase Invoices
  async getPurchases(businessId: string): Promise<PurchaseInvoice[]> {
    const key = `${STORAGE_KEYS.PURCHASES}_${businessId}`;
    let list: PurchaseInvoice[];
    if (memoryCache.has(key)) {
      list = memoryCache.get(key);
    } else {
      const raw = await AsyncStorage.getItem(key);
      list = raw ? JSON.parse(raw) : [];
      memoryCache.set(key, list);
    }

    // Hydrate attachments from IndexedDB if not already in memory
    for (const p of list) {
      if (!p.billPhotoUri && p.billFileName) {
        const attached = await AttachmentService.get(p.id);
        if (attached) {
          p.billPhotoUri = attached;
        }
      }
    }

    return [...list];
  },

  async savePurchases(businessId: string, purchases: PurchaseInvoice[]): Promise<void> {
    const key = `${STORAGE_KEYS.PURCHASES}_${businessId}`;
    memoryCache.set(key, [...purchases]);

    // Save all attachments into high-capacity IndexedDB so they are safely preserved
    for (const p of purchases) {
      if (p.billPhotoUri) {
        await AttachmentService.save(p.id, p.billPhotoUri);
      }
    }

    try {
      await AsyncStorage.setItem(key, JSON.stringify(purchases));
    } catch (quotaErr) {
      console.warn('AsyncStorage quota hit on savePurchases. Storing lightweight purchases with IndexedDB attachments:', quotaErr);
      try {
        // Strip heavy billPhotoUri from AsyncStorage JSON since it is safely stored in IndexedDB
        const strippedPurchases = purchases.map((p) => ({
          ...p,
          billPhotoUri: undefined,
        }));
        await AsyncStorage.setItem(key, JSON.stringify(strippedPurchases));
      } catch (fatalErr) {
        console.error('Fatal AsyncStorage savePurchases error:', fatalErr);
      }
    }
  },

  // Supplier Payments
  async getSupplierPayments(businessId: string): Promise<SupplierPayment[]> {
    const key = `${STORAGE_KEYS.SUPPLIER_PAYMENTS}_${businessId}`;
    if (memoryCache.has(key)) {
      return [...memoryCache.get(key)];
    }
    const raw = await AsyncStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    memoryCache.set(key, list);
    return [...list];
  },

  async saveSupplierPayments(businessId: string, payments: SupplierPayment[]): Promise<void> {
    const key = `${STORAGE_KEYS.SUPPLIER_PAYMENTS}_${businessId}`;
    memoryCache.set(key, [...payments]);
    await AsyncStorage.setItem(key, JSON.stringify(payments));
  },

  // Stock Adjustments
  async getStockAdjustments(businessId: string): Promise<StockAdjustment[]> {
    const key = `${STORAGE_KEYS.STOCK_ADJUSTMENTS}_${businessId}`;
    if (memoryCache.has(key)) {
      return [...memoryCache.get(key)];
    }
    const raw = await AsyncStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    memoryCache.set(key, list);
    return [...list];
  },

  async saveStockAdjustments(businessId: string, adjustments: StockAdjustment[]): Promise<void> {
    const key = `${STORAGE_KEYS.STOCK_ADJUSTMENTS}_${businessId}`;
    memoryCache.set(key, [...adjustments]);
    await AsyncStorage.setItem(key, JSON.stringify(adjustments));
  },

  // Daily Expenses (Petty cash & shop expenses)
  async getDailyExpenses(businessId: string, date?: string): Promise<DailyExpenseItem[]> {
    const key = `${STORAGE_KEYS.DAILY_EXPENSES}_${businessId}`;
    let list: DailyExpenseItem[];
    if (memoryCache.has(key)) {
      list = memoryCache.get(key);
    } else {
      const raw = await AsyncStorage.getItem(key);
      list = raw ? JSON.parse(raw) : [];
      memoryCache.set(key, list);
    }
    if (date) {
      return list.filter((e) => e.date === date);
    }
    return [...list];
  },

  async saveDailyExpenses(businessId: string, expenses: DailyExpenseItem[]): Promise<void> {
    const key = `${STORAGE_KEYS.DAILY_EXPENSES}_${businessId}`;
    memoryCache.set(key, [...expenses]);
    await AsyncStorage.setItem(key, JSON.stringify(expenses));
  },

  // Daily Cash Closings (Reconciled day-end closings)
  async getDailyCashClosings(businessId: string): Promise<DailyCashClosing[]> {
    const key = `${STORAGE_KEYS.DAILY_CASH_CLOSINGS}_${businessId}`;
    if (memoryCache.has(key)) {
      return [...memoryCache.get(key)];
    }
    const raw = await AsyncStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    memoryCache.set(key, list);
    return [...list];
  },

  async saveDailyCashClosings(businessId: string, closings: DailyCashClosing[]): Promise<void> {
    const key = `${STORAGE_KEYS.DAILY_CASH_CLOSINGS}_${businessId}`;
    memoryCache.set(key, [...closings]);
    await AsyncStorage.setItem(key, JSON.stringify(closings));
  },

  // Pending Sync
  async getPendingSyncCount(businessId: string): Promise<number> {
    const raw = await AsyncStorage.getItem(`${STORAGE_KEYS.PENDING_SYNC}_${businessId}`);
    const list = raw ? JSON.parse(raw) : [];
    return list.length;
  },

  // Clear data
  async clearBusinessData(businessId: string): Promise<void> {
    const vKey = `${STORAGE_KEYS.VILLAGES}_${businessId}`;
    const cKey = `${STORAGE_KEYS.CUSTOMERS}_${businessId}`;
    const tKey = `${STORAGE_KEYS.TRANSACTIONS}_${businessId}`;
    const pKey = `${STORAGE_KEYS.PRODUCTS}_${businessId}`;
    const uomKey = `${STORAGE_KEYS.UOMS}_${businessId}`;
    const convKey = `${STORAGE_KEYS.UOM_CONVERSIONS}_${businessId}`;
    const supKey = `${STORAGE_KEYS.SUPPLIERS}_${businessId}`;
    const purKey = `${STORAGE_KEYS.PURCHASES}_${businessId}`;
    const supPayKey = `${STORAGE_KEYS.SUPPLIER_PAYMENTS}_${businessId}`;
    const adjKey = `${STORAGE_KEYS.STOCK_ADJUSTMENTS}_${businessId}`;
    const expKey = `${STORAGE_KEYS.DAILY_EXPENSES}_${businessId}`;
    const closeKey = `${STORAGE_KEYS.DAILY_CASH_CLOSINGS}_${businessId}`;
    const sKey = `${STORAGE_KEYS.PENDING_SYNC}_${businessId}`;

    memoryCache.delete(vKey);
    memoryCache.delete(cKey);
    memoryCache.delete(tKey);
    memoryCache.delete(pKey);
    memoryCache.delete(uomKey);
    memoryCache.delete(convKey);
    memoryCache.delete(supKey);
    memoryCache.delete(purKey);
    memoryCache.delete(supPayKey);
    memoryCache.delete(adjKey);
    memoryCache.delete(expKey);
    memoryCache.delete(closeKey);
    memoryCache.delete(sKey);

    await AsyncStorage.removeItem(vKey);
    await AsyncStorage.removeItem(cKey);
    await AsyncStorage.removeItem(tKey);
    await AsyncStorage.removeItem(pKey);
    await AsyncStorage.removeItem(uomKey);
    await AsyncStorage.removeItem(convKey);
    await AsyncStorage.removeItem(supKey);
    await AsyncStorage.removeItem(purKey);
    await AsyncStorage.removeItem(supPayKey);
    await AsyncStorage.removeItem(adjKey);
    await AsyncStorage.removeItem(expKey);
    await AsyncStorage.removeItem(closeKey);
    await AsyncStorage.removeItem(sKey);
  },

  // User & Authentication
  async getCurrentUser(): Promise<AppUser | null> {
    if (memoryCache.has(STORAGE_KEYS.CURRENT_USER)) {
      return memoryCache.get(STORAGE_KEYS.CURRENT_USER);
    }
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    const data = raw ? JSON.parse(raw) : null;
    if (data) memoryCache.set(STORAGE_KEYS.CURRENT_USER, data);
    return data;
  },

  async setCurrentUser(user: AppUser | null): Promise<void> {
    if (user) {
      memoryCache.set(STORAGE_KEYS.CURRENT_USER, user);
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      memoryCache.delete(STORAGE_KEYS.CURRENT_USER);
      await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
  },

  async getIsGuest(): Promise<boolean> {
    if (memoryCache.has(STORAGE_KEYS.IS_GUEST)) {
      return memoryCache.get(STORAGE_KEYS.IS_GUEST);
    }
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.IS_GUEST);
    // Default to true (Guest mode) if not set
    const isGuest = raw === null ? true : raw === 'true';
    memoryCache.set(STORAGE_KEYS.IS_GUEST, isGuest);
    return isGuest;
  },

  async setIsGuest(isGuest: boolean): Promise<void> {
    memoryCache.set(STORAGE_KEYS.IS_GUEST, isGuest);
    await AsyncStorage.setItem(STORAGE_KEYS.IS_GUEST, isGuest ? 'true' : 'false');
  },

  async getLocalUsers(): Promise<{ email: string; pass: string; name?: string; uid: string }[]> {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.LOCAL_USERS);
    return raw ? JSON.parse(raw) : [];
  },

  async saveLocalUser(newUser: { email: string; pass: string; name?: string; uid: string }): Promise<void> {
    const users = await this.getLocalUsers();
    const idx = users.findIndex((u) => u.email.toLowerCase() === newUser.email.toLowerCase());
    if (idx >= 0) {
      users[idx] = newUser;
    } else {
      users.push(newUser);
    }
    await AsyncStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(users));
  },

  async clearAllLocalAuthAndUsers(): Promise<void> {
    memoryCache.delete(STORAGE_KEYS.CURRENT_USER);
    memoryCache.delete(STORAGE_KEYS.IS_GUEST);
    memoryCache.delete(STORAGE_KEYS.LOCAL_USERS);
    await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    await AsyncStorage.removeItem(STORAGE_KEYS.IS_GUEST);
    await AsyncStorage.removeItem(STORAGE_KEYS.LOCAL_USERS);
  },
};
