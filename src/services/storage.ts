import AsyncStorage from '@react-native-async-storage/async-storage';
import { Business, Village, Customer, Transaction, AppUser } from '../types';

const STORAGE_KEYS = {
  CURRENT_BUSINESS: '@khata_book_current_business',
  ALL_BUSINESSES: '@khata_book_all_businesses',
  VILLAGES: '@khata_book_villages',
  CUSTOMERS: '@khata_book_customers',
  TRANSACTIONS: '@khata_book_transactions',
  PENDING_SYNC: '@khata_book_pending_sync',
  APP_LANGUAGE: '@khata_book_language',
  CURRENT_USER: '@khata_book_current_user',
  IS_GUEST: '@khata_book_is_guest',
  LOCAL_USERS: '@khata_book_local_users',
};

// High-speed in-memory L1 cache for instant (0ms) data retrieval
const memoryCache = new Map<string, any>();

export const StorageService = {
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
    memoryCache.set(STORAGE_KEYS.CURRENT_BUSINESS, business);
    await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_BUSINESS, JSON.stringify(business));
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
      return memoryCache.get(key);
    }
    const raw = await AsyncStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    memoryCache.set(key, list);
    return list;
  },

  async saveVillages(businessId: string, villages: Village[]): Promise<void> {
    const key = `${STORAGE_KEYS.VILLAGES}_${businessId}`;
    memoryCache.set(key, villages);
    await AsyncStorage.setItem(key, JSON.stringify(villages));
  },

  // Customers
  async getCustomers(businessId: string): Promise<Customer[]> {
    const key = `${STORAGE_KEYS.CUSTOMERS}_${businessId}`;
    if (memoryCache.has(key)) {
      return memoryCache.get(key);
    }
    const raw = await AsyncStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    memoryCache.set(key, list);
    return list;
  },

  async saveCustomers(businessId: string, customers: Customer[]): Promise<void> {
    const key = `${STORAGE_KEYS.CUSTOMERS}_${businessId}`;
    memoryCache.set(key, customers);
    await AsyncStorage.setItem(key, JSON.stringify(customers));
  },

  // Transactions
  async getTransactions(businessId: string): Promise<Transaction[]> {
    const key = `${STORAGE_KEYS.TRANSACTIONS}_${businessId}`;
    if (memoryCache.has(key)) {
      return memoryCache.get(key);
    }
    const raw = await AsyncStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    memoryCache.set(key, list);
    return list;
  },

  async saveTransactions(businessId: string, transactions: Transaction[]): Promise<void> {
    const key = `${STORAGE_KEYS.TRANSACTIONS}_${businessId}`;
    memoryCache.set(key, transactions);
    await AsyncStorage.setItem(key, JSON.stringify(transactions));
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
    const sKey = `${STORAGE_KEYS.PENDING_SYNC}_${businessId}`;

    memoryCache.delete(vKey);
    memoryCache.delete(cKey);
    memoryCache.delete(tKey);
    memoryCache.delete(sKey);

    await AsyncStorage.removeItem(vKey);
    await AsyncStorage.removeItem(cKey);
    await AsyncStorage.removeItem(tKey);
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
