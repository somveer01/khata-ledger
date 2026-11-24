import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc,
  getDocs, 
  query, 
  where, 
  serverTimestamp, 
  runTransaction,
  writeBatch 
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import { StorageService, AttachmentService } from './storage';
import { Business, Village, Customer, Transaction, VillageSummary, DashboardMetrics, AppUser, StoreActivityStats, Product, UnitOfMeasurement, UnitConversion, Supplier, SupplierPayment, PurchaseInvoice, StockItemSummary, StockAdjustment, DailyExpenseItem, DailyCashClosing, DayTransactionItem } from '../types';
import { calculateCustomerBalance, calculateVillageSummaries, calculateDashboardMetrics, calculateCustomerDueDate } from './accounting';
import { toPaise } from '../utils/money';
import { isDayPast9PM } from '../utils/date';
import { 
  getBusinessIdFromEmail, 
  isLegacyOwner, 
  LEGACY_BUSINESS_ID, 
  LEGACY_BUSINESS_TENANT_ID, 
  LEGACY_OWNER_EMAIL,
  getCounterCustomerId,
  isCounterCustomerId 
} from '../utils/tenant';
import { PRELOADED_TYCOON_PRODUCTS } from '../data/preloadedProducts';
import { SYSTEM_DEFAULT_UOMS, SYSTEM_DEFAULT_CONVERSIONS } from '../data/defaultUOMs';

/**
 * Strips all `undefined` fields from an object recursively.
 * Cloud Firestore setDoc/fTx.set crashes synchronously with:
 * "Function DocumentReference.set() called with invalid data. Unsupported field value: undefined"
 */
export function cleanForFirestore<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) {
      if (Array.isArray(val)) {
        result[key] = val
          .filter((item) => item !== undefined)
          .map((item) => {
            if (
              item !== null &&
              typeof item === 'object' &&
              !(item instanceof Date) &&
              typeof (item as any).toMillis !== 'function'
            ) {
              return cleanForFirestore(item);
            }
            return item;
          });
      } else if (
        val !== null &&
        typeof val === 'object' &&
        !(val instanceof Date) &&
        typeof (val as any).toMillis !== 'function'
      ) {
        result[key] = cleanForFirestore(val);
      } else {
        result[key] = val;
      }
    }
  }
  return result;
}

/**
 * Ensures strict tenant isolation by stripping out auto-seeded demo/preloaded products.
 * Any product with an ID starting with 'prod_seed_' is a demo item and must never
 * pollute a real business catalog or show up across tenant screens.
 */
export function sanitizeProductList(raw: Product[]): { cleaned: Product[]; hadSeed: boolean } {
  if (!Array.isArray(raw)) return { cleaned: [], hadSeed: false };
  const cleaned = raw.filter((p) => {
    if (!p || typeof p !== 'object') return false;
    if (typeof p.id === 'string' && p.id.startsWith('prod_seed_')) {
      return false;
    }
    return true;
  });
  return { cleaned, hadSeed: cleaned.length !== raw.length };
}

export const DataRepository = {
  // -------------------------------------------------------------
  // BUSINESS PROFILE & MULTI-TENANCY
  // -------------------------------------------------------------
  async getBusiness(businessId: string): Promise<Business | null> {
    if (isFirebaseConfigured() && db) {
      try {
        const snap = await getDocs(query(collection(db, 'businesses'), where('id', '==', businessId)));
        if (!snap.empty) {
          const remoteBiz = snap.docs[0].data() as Business;
          await StorageService.saveBusiness(remoteBiz);
          return remoteBiz;
        }
      } catch (err) {
        console.warn('Firestore getBusiness fallback to storage:', err);
      }
    }
    return (await StorageService.getBusiness(businessId)) || StorageService.getCurrentBusiness();
  },

  async getAllBusinesses(): Promise<Business[]> {
    const list: Business[] = [];
    if (isFirebaseConfigured() && db) {
      try {
        const snap = await getDocs(collection(db, 'businesses'));
        snap.forEach((d) => {
          const data = d.data() as Business;
          if (data && data.id) {
            // Filter out empty temporary duplicate
            if (data.id === 'biz_sukhveersinghkush_gmail_com') return;
            list.push(data);
          }
        });
      } catch (err) {
        console.warn('Firestore getAllBusinesses error:', err);
      }
    }

    const uniqueMap = new Map<string, Business>();
    list.forEach((b) => {
      // For biz_default_1, make sure Sukhveer's email is visible
      if (b.id === LEGACY_BUSINESS_ID && !b.ownerEmail) {
        b.ownerEmail = LEGACY_OWNER_EMAIL;
      }
      uniqueMap.set(b.id, b);
    });

    const current = await StorageService.getCurrentBusiness();
    if (current && !uniqueMap.has(current.id) && current.id !== 'biz_sukhveersinghkush_gmail_com') {
      if (current.id === LEGACY_BUSINESS_ID && !current.ownerEmail) {
        current.ownerEmail = LEGACY_OWNER_EMAIL;
      }
      uniqueMap.set(current.id, current);
    }
    return Array.from(uniqueMap.values());
  },

  async getStoreActivityOverview(): Promise<StoreActivityStats[]> {
    const allBusinesses = await this.getAllBusinesses();

    let customersList: Customer[] = [];
    let villagesList: Village[] = [];
    let transactionsList: Transaction[] = [];

    if (isFirebaseConfigured() && db) {
      try {
        const curBiz = await StorageService.getCurrentBusiness();
        if (curBiz) {
          await this.syncLocalDataToFirestore(curBiz.id).catch(() => {});
        }

        const [cSnap, vSnap, tSnap] = await Promise.all([
          getDocs(collection(db, 'customers')),
          getDocs(collection(db, 'villages')),
          getDocs(collection(db, 'transactions')),
        ]);

        customersList = cSnap.docs.map((d) => d.data() as Customer);
        villagesList = vSnap.docs.map((d) => d.data() as Village);
        transactionsList = tSnap.docs.map((d) => d.data() as Transaction);
      } catch (err) {
        console.warn('Firestore getStoreActivityOverview error:', err);
      }
    }

    const now = new Date();
    const sevenDaysAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const statsList: StoreActivityStats[] = [];

    // Auto-discover any stores present in customers or transactions that might not have a business document
    const knownBizIds = new Set(allBusinesses.map((b) => b.id));
    knownBizIds.add(LEGACY_BUSINESS_TENANT_ID);

    const candidateIds = new Set<string>();
    customersList.forEach((c) => {
      if (c.businessId) candidateIds.add(c.businessId);
    });
    transactionsList.forEach((t) => {
      if (t.businessId) candidateIds.add(t.businessId);
    });

    for (const bId of candidateIds) {
      if (!knownBizIds.has(bId) && bId !== 'biz_guest') {
        knownBizIds.add(bId);
        const derivedEmail = bId.startsWith('biz_') ? bId.replace('biz_', '').replace(/_/g, '.') : '';
        const syntheticBiz: Business = {
          id: bId,
          name: `दुकान (${derivedEmail.split('@')[0] || bId})`,
          ownerName: derivedEmail ? derivedEmail.split('@')[0] : 'दुकानदार',
          phone: '',
          currency: 'INR',
          ownerEmail: derivedEmail.includes('@') ? derivedEmail : undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        allBusinesses.push(syntheticBiz);
      }
    }

    for (const biz of allBusinesses) {
      // Find customers for this biz
      let bizCustomers = customersList.filter(
        (c) => c.businessId === biz.id || (biz.id === LEGACY_BUSINESS_ID && c.businessId === LEGACY_BUSINESS_TENANT_ID)
      );
      if (bizCustomers.length === 0) {
        bizCustomers = await StorageService.getCustomers(biz.id);
        if (bizCustomers.length === 0 && biz.id === LEGACY_BUSINESS_ID) {
          bizCustomers = await StorageService.getCustomers(LEGACY_BUSINESS_TENANT_ID);
        }
      }

      // Find villages for this biz
      let bizVillages = villagesList.filter(
        (v) => v.businessId === biz.id || (biz.id === LEGACY_BUSINESS_ID && v.businessId === LEGACY_BUSINESS_TENANT_ID)
      );
      if (bizVillages.length === 0) {
        bizVillages = await StorageService.getVillages(biz.id);
        if (bizVillages.length === 0 && biz.id === LEGACY_BUSINESS_ID) {
          bizVillages = await StorageService.getVillages(LEGACY_BUSINESS_TENANT_ID);
        }
      }

      // Find transactions for this biz
      let bizTxs = transactionsList.filter(
        (t) => t.businessId === biz.id || (biz.id === LEGACY_BUSINESS_ID && t.businessId === LEGACY_BUSINESS_TENANT_ID)
      );
      if (bizTxs.length === 0) {
        bizTxs = await StorageService.getTransactions(biz.id);
        if (bizTxs.length === 0 && biz.id === LEGACY_BUSINESS_ID) {
          bizTxs = await StorageService.getTransactions(LEGACY_BUSINESS_TENANT_ID);
        }
      }

      let creditSaleCount = 0;
      let paymentCount = 0;
      let latestTxDate: string | undefined = undefined;
      let latestTxTimeMs = 0;
      let totalOutstandingPaise = 0;

      for (const t of bizTxs) {
        if (t.type === 'CREDIT_SALE') {
          creditSaleCount++;
        } else if (t.type === 'PAYMENT') {
          paymentCount++;
        }

        const txTimeStr = t.createdAt || t.date;
        if (txTimeStr) {
          const txTimeMs = new Date(txTimeStr).getTime();
          if (!isNaN(txTimeMs) && txTimeMs > latestTxTimeMs) {
            latestTxTimeMs = txTimeMs;
            latestTxDate = txTimeStr;
          }
        }
      }

      for (const c of bizCustomers) {
        if (c.currentBalancePaise && c.currentBalancePaise > 0) {
          totalOutstandingPaise += c.currentBalancePaise;
        }
        const cTimeStr = c.updatedAt || c.createdAt;
        if (cTimeStr) {
          const cTimeMs = new Date(cTimeStr).getTime();
          if (!isNaN(cTimeMs) && cTimeMs > latestTxTimeMs) {
            latestTxTimeMs = cTimeMs;
            latestTxDate = cTimeStr;
          }
        }
      }

      for (const v of bizVillages) {
        const vTimeStr = (v as any).updatedAt || (v as any).createdAt;
        if (vTimeStr) {
          const vTimeMs = new Date(vTimeStr).getTime();
          if (!isNaN(vTimeMs) && vTimeMs > latestTxTimeMs) {
            latestTxTimeMs = vTimeMs;
            latestTxDate = vTimeStr;
          }
        }
      }

      const pUpdatedAt = (biz as any).productsUpdatedAt;
      if (pUpdatedAt) {
        const pTimeMs = new Date(pUpdatedAt).getTime();
        if (!isNaN(pTimeMs) && pTimeMs > latestTxTimeMs) {
          latestTxTimeMs = pTimeMs;
          latestTxDate = pUpdatedAt;
        }
      }

      const isActive = latestTxTimeMs > 0 && latestTxTimeMs >= sevenDaysAgoMs;

      const productCount = Array.isArray((biz as any).productsCatalog)
        ? (biz as any).productsCatalog.length
        : 0;

      statsList.push({
        business: biz,
        customerCount: bizCustomers.length,
        villageCount: bizVillages.length,
        creditSaleCount,
        paymentCount,
        totalTransactionCount: bizTxs.length,
        lastActiveDate: latestTxDate,
        isActive,
        totalOutstandingPaise,
        productCount,
      });
    }

    statsList.sort((a, b) => {
      const aTime = a.lastActiveDate ? new Date(a.lastActiveDate).getTime() : 0;
      const bTime = b.lastActiveDate ? new Date(b.lastActiveDate).getTime() : 0;
      return bTime - aTime;
    });

    return statsList;
  },

  async getOrCreateBusinessForUser(user: AppUser): Promise<Business> {
    const email = user.email || '';
    const targetBusinessId = email ? getBusinessIdFromEmail(email) : 'biz_guest';

    // 1. Try local cache first for instant (0ms) response
    const cachedBiz = await StorageService.getBusiness(targetBusinessId);
    if (cachedBiz) {
      // Sync in background from Firestore
      if (isFirebaseConfigured() && db) {
        getDocs(query(collection(db, 'businesses'), where('id', '==', targetBusinessId)))
          .then(async (snap) => {
            if (!snap.empty) {
              const remoteBiz = snap.docs[0].data() as Business;
              await StorageService.saveBusiness(remoteBiz);
            }
          })
          .catch((err) => console.warn('Background getBusiness error:', err));
      }
      return cachedBiz;
    }

    // 2. Check Firestore for this specific user's business
    if (isFirebaseConfigured() && db) {
      try {
        const snap = await getDocs(query(collection(db, 'businesses'), where('id', '==', targetBusinessId)));
        if (!snap.empty) {
          const remoteBiz = snap.docs[0].data() as Business;
          if (targetBusinessId === LEGACY_BUSINESS_ID && !remoteBiz.ownerEmail) {
            remoteBiz.ownerEmail = email.toLowerCase();
            this.saveBusiness(remoteBiz).catch(() => {});
          }
          await StorageService.saveBusiness(remoteBiz);
          return remoteBiz;
        }
      } catch (err) {
        console.warn('Firestore getBusiness error:', err);
      }
    }

    // 3. Fallback for legacy owner (Sukhveer): ensure biz_default_1 is used
    if (targetBusinessId === LEGACY_BUSINESS_ID) {
      const legBiz = (await StorageService.getBusiness(LEGACY_BUSINESS_ID)) || (await StorageService.getCurrentBusiness());
      if (legBiz) {
        const updatedLegBiz: Business = {
          ...legBiz,
          id: LEGACY_BUSINESS_ID,
          ownerEmail: email.toLowerCase(),
          updatedAt: new Date().toISOString(),
        };
        await this.saveBusiness(updatedLegBiz);
        return updatedLegBiz;
      }
    }

    // 4. Create new isolated business for new user
    const newBiz: Business = {
      id: targetBusinessId,
      name: user.displayName || (email.split('@')[0] ? `${email.split('@')[0]} की दुकान` : 'लेजर (Ledger)'),
      ownerName: user.displayName || email.split('@')[0] || 'दुकानदार',
      phone: '',
      currency: 'INR',
      ownerEmail: email.toLowerCase(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.saveBusiness(newBiz);
    return newBiz;
  },

  async saveBusiness(business: Business): Promise<void> {
    await StorageService.saveBusiness(business);
    if (isFirebaseConfigured() && db) {
      try {
        setDoc(doc(db, 'businesses', business.id), cleanForFirestore({
          ...business,
          updatedAt: new Date().toISOString(),
          serverTimestamp: serverTimestamp(),
        })).catch((err) => {
          console.warn('Firestore saveBusiness error:', err);
        });
      } catch (err) {
        console.warn('Firestore saveBusiness error:', err);
      }
    }
  },

  // -------------------------------------------------------------
  // VILLAGES
  // -------------------------------------------------------------
  async getVillages(businessId: string, forceRefresh = false): Promise<Village[]> {
    let localVillages = await StorageService.getVillages(businessId);

    // If local cache is empty and this is the legacy owner, check legacy key
    if (localVillages.length === 0 && businessId === LEGACY_BUSINESS_TENANT_ID) {
      const legLocal = await StorageService.getVillages(LEGACY_BUSINESS_ID);
      if (legLocal.length > 0) {
        localVillages = legLocal.map((v) => ({ ...v, businessId }));
        await StorageService.saveVillages(businessId, localVillages);
      }
    }

    if (isFirebaseConfigured() && db) {
      const syncVillagesTask = async () => {
        try {
          const snap = await getDocs(query(collection(db, 'villages'), where('businessId', '==', businessId)));
          if (!snap.empty) {
            const list = snap.docs.map((d) => d.data() as Village);
            await StorageService.saveVillages(businessId, list);
            return list;
          } else if (businessId === LEGACY_BUSINESS_TENANT_ID) {
            const legSnap = await getDocs(query(collection(db, 'villages'), where('businessId', '==', LEGACY_BUSINESS_ID)));
            if (!legSnap.empty) {
              const list = legSnap.docs.map((d) => ({ ...d.data(), businessId } as Village));
              await StorageService.saveVillages(businessId, list);
              list.forEach((v) => {
                setDoc(doc(db, 'villages', v.id), { ...v, serverTimestamp: serverTimestamp() }, { merge: true }).catch(() => {});
              });
              return list;
            }
          }
        } catch (err) {
          console.warn('Firestore getVillages error:', err);
        }
        return localVillages;
      };

      if (!forceRefresh && localVillages.length > 0) {
        // FAST 0ms PATH: Return local cache immediately, sync in background
        syncVillagesTask().catch(() => {});
        return [...localVillages];
      }

      // Explicit pull-to-refresh or empty local cache: await Firestore
      return await syncVillagesTask();
    }
    return [...localVillages];
  },

  async saveVillage(village: Village): Promise<{ success: boolean; error?: string }> {
    const villages = await StorageService.getVillages(village.businessId);
    // Duplicate village name check (case-insensitive)
    const duplicate = villages.find(
      (v) => v.id !== village.id && v.name.trim().toLowerCase() === village.name.trim().toLowerCase()
    );
    if (duplicate) {
      return { success: false, error: 'A village with this name already exists' };
    }

    const index = villages.findIndex((v) => v.id === village.id);
    if (index >= 0) {
      villages[index] = { ...village, updatedAt: new Date().toISOString() };
      // Also update villageName in customers who belong to this village
      const customers = await StorageService.getCustomers(village.businessId);
      let custsChanged = false;
      customers.forEach((c) => {
        if (c.villageId === village.id) {
          c.villageName = village.name;
          custsChanged = true;
        }
      });
      if (custsChanged) {
        await StorageService.saveCustomers(village.businessId, customers);
      }
    } else {
      villages.push(village);
    }

    await StorageService.saveVillages(village.businessId, villages);

    if (isFirebaseConfigured() && db) {
      try {
        setDoc(doc(db, 'villages', village.id), cleanForFirestore({
          ...village,
          serverTimestamp: serverTimestamp(),
        })).catch((err) => {
          console.warn('Firestore saveVillage error:', err);
        });
      } catch (err) {
        console.warn('Firestore saveVillage error:', err);
      }
    }

    return { success: true };
  },

  async deleteVillage(businessId: string, villageId: string): Promise<{ success: boolean; error?: string }> {
    const villages = await StorageService.getVillages(businessId);
    const targetVillage = villages.find((v) => v.id === villageId);
    const villageName = targetVillage?.name;

    const filtered = villages.filter((v) => v.id !== villageId && v.id !== 'other');
    await StorageService.saveVillages(businessId, filtered);

    // Unassign customers from this deleted village (ledger and balance remain 100% safe)
    const customers = await StorageService.getCustomers(businessId);
    let custsChanged = false;
    customers.forEach((c) => {
      if (
        c.villageId === villageId ||
        (villageId === 'other' && (!c.villageId || c.villageId === 'other' || c.villageName === 'Other')) ||
        (villageName && c.villageName === villageName)
      ) {
        c.villageId = '';
        c.villageName = '';
        c.updatedAt = new Date().toISOString();
        custsChanged = true;
      }
    });
    if (custsChanged) {
      await StorageService.saveCustomers(businessId, customers);
    }

    // Also clear denormalized villageName on transactions
    if (villageName || villageId === 'other') {
      const txs = await StorageService.getTransactions(businessId);
      let txChanged = false;
      txs.forEach((tx) => {
        if ((villageName && tx.villageName === villageName) || (villageId === 'other' && tx.villageName === 'Other')) {
          tx.villageName = '';
          txChanged = true;
        }
      });
      if (txChanged) {
        await StorageService.saveTransactions(businessId, txs);
      }
    }

    if (isFirebaseConfigured() && db && villageId !== 'other') {
      try {
        await deleteDoc(doc(db, 'villages', villageId));
      } catch (err) {
        console.warn('Firestore deleteVillage error:', err);
      }
    }

    return { success: true };
  },

  // -------------------------------------------------------------
  // CUSTOMERS
  // -------------------------------------------------------------
  async getCustomers(businessId: string, forceRefresh = false): Promise<Customer[]> {
    let localCustomers = await StorageService.getCustomers(businessId);

    // If local cache is empty and this is the legacy owner, check legacy key
    if (localCustomers.length === 0 && businessId === LEGACY_BUSINESS_TENANT_ID) {
      const legLocal = await StorageService.getCustomers(LEGACY_BUSINESS_ID);
      if (legLocal.length > 0) {
        localCustomers = legLocal.map((c) => ({ ...c, businessId }));
        await StorageService.saveCustomers(businessId, localCustomers);
      }
    }

    if (isFirebaseConfigured() && db) {
      const syncCustomersTask = async () => {
        try {
          const snap = await getDocs(query(collection(db, 'customers'), where('businessId', '==', businessId)));
          if (!snap.empty) {
            const list = snap.docs.map((d) => d.data() as Customer);
            const currentLocal = await StorageService.getCustomers(businessId);
            const mergedMap = new Map<string, Customer>();
            currentLocal.forEach((c) => mergedMap.set(c.id, c));
            list.forEach((c) => {
              const existing = mergedMap.get(c.id);
              if (!existing || new Date(c.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
                mergedMap.set(c.id, c);
              }
            });
            const mergedList = Array.from(mergedMap.values());
            await StorageService.saveCustomers(businessId, mergedList);
            return mergedList;
          } else if (businessId === LEGACY_BUSINESS_TENANT_ID) {
            const legSnap = await getDocs(query(collection(db, 'customers'), where('businessId', '==', LEGACY_BUSINESS_ID)));
            if (!legSnap.empty) {
              const list = legSnap.docs.map((d) => ({ ...d.data(), businessId } as Customer));
              await StorageService.saveCustomers(businessId, list);
              list.forEach((c) => {
                setDoc(doc(db, 'customers', c.id), { ...c, serverTimestamp: serverTimestamp() }, { merge: true }).catch(() => {});
              });
              return list;
            }
          }
        } catch (err) {
          console.warn('Firestore getCustomers error:', err);
        }
        return localCustomers;
      };

      if (!forceRefresh && localCustomers.length > 0) {
        // FAST 0ms PATH: Return local cache immediately, sync in background
        syncCustomersTask().catch(() => {});
        return [...localCustomers];
      }

      // Explicit pull-to-refresh or empty local cache: await Firestore
      return await syncCustomersTask();
    }
    return [...localCustomers];
  },

  async getOrCreateCounterCustomer(businessId: string): Promise<Customer> {
    const counterId = getCounterCustomerId(businessId);
    const customers = await StorageService.getCustomers(businessId);
    const existing = customers.find((c) => c.id === counterId || isCounterCustomerId(c.id));
    if (existing) {
      return existing;
    }

    // Check in Firestore if available
    if (isFirebaseConfigured() && db) {
      try {
        const snap = await getDoc(doc(db, 'customers', counterId));
        if (snap.exists()) {
          const remoteCust = snap.data() as Customer;
          await StorageService.saveCustomers(businessId, [...customers, remoteCust]);
          return remoteCust;
        }
      } catch (err) {
        console.warn('Firestore getOrCreateCounterCustomer error:', err);
      }
    }

    // Create virtual counter customer
    const newCounterCust: Customer = {
      id: counterId,
      businessId,
      name: 'फुटकर / काउंटर ग्राहक',
      villageId: 'other',
      villageName: 'काउंटर बिक्री',
      mobile: '',
      openingBalancePaise: 0,
      currentBalancePaise: 0,
      totalCreditPaise: 0,
      totalPaymentPaise: 0,
      transactionCount: 0,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = [...customers, newCounterCust];
    await StorageService.saveCustomers(businessId, updated);

    if (isFirebaseConfigured() && db) {
      setDoc(
        doc(db, 'customers', counterId),
        cleanForFirestore({
          ...newCounterCust,
          serverTimestamp: serverTimestamp(),
        }),
        { merge: true }
      ).catch(() => {});
    }

    return newCounterCust;
  },

  async saveCustomer(customer: Customer): Promise<{ success: boolean; customer: Customer; error?: string }> {
    const customers = await StorageService.getCustomers(customer.businessId);

    // Duplicate check: Customer with same name AND same village (either creation or modification)
    const normName = customer.name.trim().toLowerCase();
    const targetVillageId = (customer.villageId || '').trim();
    const targetVillageName = (customer.villageName || '').trim().toLowerCase();

    const duplicate = customers.find((c) => {
      // Exclude current customer when modifying
      if (c.id === customer.id) return false;

      const cName = c.name.trim().toLowerCase();
      if (cName !== normName) return false;

      const cVillageId = (c.villageId || '').trim();
      const cVillageName = (c.villageName || '').trim().toLowerCase();

      if (targetVillageId && cVillageId) {
        return targetVillageId === cVillageId || (targetVillageName && cVillageName && targetVillageName === cVillageName);
      }
      return targetVillageName === cVillageName;
    });

    if (duplicate) {
      return {
        success: false,
        customer,
        error: 'DUPLICATE_CUSTOMER',
      };
    }

    const index = customers.findIndex((c) => c.id === customer.id);
    let updatedCustomer = { ...customer };

    if (index >= 0) {
      updatedCustomer.updatedAt = new Date().toISOString();
      const prevCustomer = customers[index];
      customers[index] = updatedCustomer;

      // Update denormalized customer name and village on transactions if changed
      if (prevCustomer.name !== updatedCustomer.name || prevCustomer.villageName !== updatedCustomer.villageName) {
        const txs = await StorageService.getTransactions(customer.businessId);
        let txChanged = false;
        txs.forEach((tx) => {
          if (tx.customerId === customer.id) {
            tx.customerName = updatedCustomer.name;
            tx.villageName = updatedCustomer.villageName;
            txChanged = true;
          }
        });
        if (txChanged) {
          await StorageService.saveTransactions(customer.businessId, txs);
        }
      }
    } else {
      // New customer: initialize currentBalance to openingBalance
      updatedCustomer.currentBalancePaise = customer.openingBalancePaise || 0;
      updatedCustomer.totalCreditPaise = 0;
      updatedCustomer.totalPaymentPaise = 0;
      updatedCustomer.transactionCount = 0;
      customers.push(updatedCustomer);
    }

    await StorageService.saveCustomers(customer.businessId, customers);

    if (isFirebaseConfigured() && db) {
      try {
        setDoc(doc(db, 'customers', customer.id), cleanForFirestore({
          ...updatedCustomer,
          serverTimestamp: serverTimestamp(),
        })).catch((err) => {
          console.warn('Firestore saveCustomer error:', err);
        });
      } catch (err) {
        console.warn('Firestore saveCustomer error:', err);
      }
    }

    return { success: true, customer: updatedCustomer };
  },

  async deleteCustomer(businessId: string, customerId: string): Promise<{ success: boolean; error?: string }> {
    const txs = await StorageService.getTransactions(businessId);
    const hasTransactions = txs.some((t) => t.customerId === customerId);
    if (hasTransactions) {
      return { success: false, error: 'HAS_TRANSACTIONS' };
    }

    const customers = await StorageService.getCustomers(businessId);
    const filteredCustomers = customers.filter((c) => c.id !== customerId);
    await StorageService.saveCustomers(businessId, filteredCustomers);

    if (isFirebaseConfigured() && db) {
      try {
        await deleteDoc(doc(db, 'customers', customerId));
      } catch (err) {
        console.warn('Firestore deleteCustomer error:', err);
      }
    }

    return { success: true };
  },

  // -------------------------------------------------------------
  // TRANSACTIONS & BALANCE RECONCILIATION
  // -------------------------------------------------------------
  async syncLocalDataToFirestore(businessId: string): Promise<void> {
    if (!isFirebaseConfigured() || !db) return;
    try {
      // 1. Sync Transactions
      const localTxs = await StorageService.getTransactions(businessId);
      if (localTxs.length > 0) {
        const snap = await getDocs(query(collection(db, 'transactions'), where('businessId', '==', businessId)));
        const remoteIds = new Set(snap.docs.map((d) => d.id));

        const unsynced = localTxs.filter((t) => !remoteIds.has(t.id));
        if (unsynced.length > 0) {
          for (const tx of unsynced) {
            await setDoc(
              doc(db, 'transactions', tx.id),
              cleanForFirestore({
                ...tx,
                serverTimestamp: serverTimestamp(),
              }),
              { merge: true }
            );
          }
        }
      }

      // 2. Sync Products (Dual sync: businesses doc + products collection)
      let localProducts = await StorageService.getProducts(businessId);
      const { cleaned: sanitizedLocal, hadSeed } = sanitizeProductList(localProducts);
      if (hadSeed) {
        localProducts = sanitizedLocal;
        await StorageService.saveProducts(businessId, sanitizedLocal);
      }
      if (localProducts.length > 0) {
        // A. Update businesses/{businessId} doc (ALWAYS PERMITTED by cloud security rules)
        await setDoc(
          doc(db, 'businesses', businessId),
          cleanForFirestore({
            productsCatalog: localProducts,
            productsUpdatedAt: new Date().toISOString(),
          }),
          { merge: true }
        ).catch((err) => console.warn('Sync products to business doc error:', err));

        // B. Also push to standalone products collection
        Promise.all(
          localProducts.map((p) =>
            setDoc(
              doc(db, 'products', p.id),
              cleanForFirestore({
                ...p,
                serverTimestamp: serverTimestamp(),
              }),
              { merge: true }
            ).catch(() => {})
          )
        ).catch((err) => console.warn('Sync products collection error:', err));
      } else if (hadSeed) {
        // Purged seed items from business doc
        await setDoc(
          doc(db, 'businesses', businessId),
          cleanForFirestore({
            productsCatalog: [],
            productsUpdatedAt: new Date().toISOString(),
          }),
          { merge: true }
        ).catch((err) => console.warn('Sync empty products to business doc error:', err));
      }
    } catch (err) {
      console.warn('syncLocalDataToFirestore error:', err);
    }
  },

  async getTransactions(businessId: string, customerId?: string, forceRefresh = false): Promise<Transaction[]> {
    const localTx = await StorageService.getTransactions(businessId);
    if (isFirebaseConfigured() && db) {
      let q = query(collection(db, 'transactions'), where('businessId', '==', businessId));
      if (customerId) {
        q = query(collection(db, 'transactions'), where('businessId', '==', businessId), where('customerId', '==', customerId));
      }

      const syncTransactionsTask = async () => {
        try {
          const snap = await getDocs(q);
          const allLocal = await StorageService.getTransactions(businessId);
          const remoteIds = new Set(snap.docs.map((d) => d.id));

          // Auto-sync any local transactions not yet in Firestore
          const unsynced = allLocal.filter((t) => !remoteIds.has(t.id));
          if (unsynced.length > 0) {
            for (const tx of unsynced) {
              setDoc(
                doc(db, 'transactions', tx.id),
                cleanForFirestore({
                  ...tx,
                  serverTimestamp: serverTimestamp(),
                }),
                { merge: true }
              ).catch(() => {});
            }
          }

          if (!snap.empty) {
            const list = snap.docs.map((d) => d.data() as Transaction);
            const mergedMap = new Map<string, Transaction>();
            allLocal.forEach((t) => mergedMap.set(t.id, t));
            list.forEach((t) => {
              mergedMap.set(t.id, t);
            });
            const mergedList = Array.from(mergedMap.values());
            await StorageService.saveTransactions(businessId, mergedList);
            return customerId ? mergedList.filter((t) => t.customerId === customerId) : mergedList;
          }
        } catch (err) {
          console.warn('Firestore getTransactions error:', err);
        }
        return customerId ? localTx.filter((t) => t.customerId === customerId) : localTx;
      };

      if (!forceRefresh && localTx.length > 0) {
        // FAST 0ms PATH: Return local cache immediately, sync in background
        syncTransactionsTask().catch(() => {});
        if (customerId) {
          return localTx.filter((t) => t.customerId === customerId);
        }
        return [...localTx];
      }

      // Explicit pull-to-refresh or empty local cache: await Firestore
      return await syncTransactionsTask();
    }

    if (customerId) {
      return localTx.filter((t) => t.customerId === customerId);
    }
    return [...localTx];
  },

  /**
   * Records a new financial transaction atomically.
   * Updates:
   * 1. Transaction collection (with idempotency check).
   * 2. Customer cached balance (currentBalancePaise, totalCredit, totalPayment).
   */
  async recordTransaction(
    transaction: Transaction
  ): Promise<{ success: boolean; transaction: Transaction; newBalancePaise: number; error?: string }> {
    const businessId = transaction.businessId;
    const transactions = await StorageService.getTransactions(businessId);
    const customers = await StorageService.getCustomers(businessId);

    // 1. Idempotency Check: Prevent duplicate submission on double-tap or network retry
    if (transaction.idempotencyKey) {
      const existing = transactions.find((t) => t.idempotencyKey === transaction.idempotencyKey);
      if (existing) {
        const cust = customers.find((c) => c.id === transaction.customerId);
        return {
          success: true,
          transaction: existing,
          newBalancePaise: cust?.currentBalancePaise || 0,
        };
      }
    }

    const customerIndex = customers.findIndex((c) => c.id === transaction.customerId);
    if (customerIndex < 0) {
      return {
        success: false,
        error: 'Customer not found',
        transaction,
        newBalancePaise: 0,
      };
    }

    const customer = customers[customerIndex];
    let change = 0;
    if (transaction.type === 'CREDIT_SALE') {
      change = transaction.amountPaise;
      customer.totalCreditPaise = (customer.totalCreditPaise || 0) + transaction.amountPaise;
      if (transaction.dueDate) {
        if (!customer.dueDate || (customer.currentBalancePaise || 0) <= 0) {
          customer.dueDate = transaction.dueDate;
        } else if (transaction.dueDate < customer.dueDate) {
          customer.dueDate = transaction.dueDate;
        }
      }
    } else if (transaction.type === 'PAYMENT') {
      const discount = transaction.discountPaise || 0;
      change = -(transaction.amountPaise + discount);
      customer.totalPaymentPaise = (customer.totalPaymentPaise || 0) + transaction.amountPaise;
    } else if (transaction.type === 'ADJUSTMENT') {
      change = transaction.amountPaise;
    } else if (transaction.type === 'REVERSAL') {
      change = -transaction.amountPaise;
    }

    const newBalance = (customer.currentBalancePaise || 0) + change;
    customer.currentBalancePaise = newBalance;
    customer.transactionCount = (customer.transactionCount || 0) + 1;
    if (newBalance <= 0) {
      customer.dueDate = undefined;
    }
    customer.updatedAt = new Date().toISOString();

    const finalizedTx: Transaction = {
      ...transaction,
      runningBalancePaise: newBalance,
      customerName: transaction.isCounterSale
        ? (transaction.counterCustomerName?.trim() ? `फुटकर - ${transaction.counterCustomerName.trim()}` : 'फुटकर')
        : customer.name,
      villageName: customer.villageName,
    };

    transactions.push(finalizedTx);
    customers[customerIndex] = customer;

    // Persist locally
    await StorageService.saveTransactions(businessId, transactions);
    await StorageService.saveCustomers(businessId, customers);

    // Persist to Cloud Firestore if connected (non-blocking background sync)
    if (isFirebaseConfigured() && db) {
      try {
        const txRef = doc(db, 'transactions', finalizedTx.id);
        const custRef = doc(db, 'customers', customer.id);
        const batch = writeBatch(db);
        batch.set(txRef, cleanForFirestore({
          ...finalizedTx,
          serverTimestamp: serverTimestamp(),
        }));
        batch.set(
          custRef,
          cleanForFirestore({
            currentBalancePaise: newBalance,
            totalCreditPaise: customer.totalCreditPaise,
            totalPaymentPaise: customer.totalPaymentPaise,
            transactionCount: customer.transactionCount,
            dueDate: customer.dueDate || null,
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        );
        batch.commit().catch((err) => {
          console.warn('Firestore transaction sync error (queued locally):', err);
        });
      } catch (err) {
        console.warn('Firestore transaction sync error (queued locally):', err);
      }
    }

    return {
      success: true,
      transaction: finalizedTx,
      newBalancePaise: newBalance,
    };
  },

  /**
   * Updates an existing financial transaction and recalculates customer balance atomically.
   */
  async updateTransaction(
    transaction: Transaction
  ): Promise<{ success: boolean; error?: string; newBalancePaise: number }> {
    const businessId = transaction.businessId;
    const transactions = await StorageService.getTransactions(businessId);
    const customers = await StorageService.getCustomers(businessId);

    const txIndex = transactions.findIndex((t) => t.id === transaction.id);
    if (txIndex < 0) {
      return { success: false, error: 'Transaction not found', newBalancePaise: 0 };
    }

    const custIndex = customers.findIndex((c) => c.id === transaction.customerId);
    if (custIndex < 0) {
      return { success: false, error: 'Customer not found', newBalancePaise: 0 };
    }

    const customer = customers[custIndex];
    const updatedTx: Transaction = {
      ...transaction,
      customerName: transaction.isCounterSale
        ? (transaction.counterCustomerName?.trim() ? `फुटकर - ${transaction.counterCustomerName.trim()}` : 'फुटकर')
        : customer.name,
      villageName: customer.villageName,
    };

    transactions[txIndex] = updatedTx;

    // Recalculate customer's balance, totals, and due date
    const custTxs = transactions.filter((t) => t.customerId === customer.id && !t.isReversed);
    const { totalCreditPaise, totalPaymentPaise, netOutstandingPaise, transactionCount } =
      calculateCustomerBalance(customer.openingBalancePaise, custTxs);

    customer.totalCreditPaise = totalCreditPaise;
    customer.totalPaymentPaise = totalPaymentPaise;
    customer.currentBalancePaise = netOutstandingPaise;
    customer.transactionCount = transactionCount;
    customer.dueDate = calculateCustomerDueDate(custTxs, netOutstandingPaise);
    customer.updatedAt = new Date().toISOString();

    customers[custIndex] = customer;

    await StorageService.saveTransactions(businessId, transactions);
    await StorageService.saveCustomers(businessId, customers);

    if (isFirebaseConfigured() && db) {
      try {
        const txRef = doc(db, 'transactions', updatedTx.id);
        const custRef = doc(db, 'customers', customer.id);
        const batch = writeBatch(db);
        batch.set(txRef, cleanForFirestore({
          ...updatedTx,
          serverTimestamp: serverTimestamp(),
        }));
        batch.set(
          custRef,
          cleanForFirestore({
            currentBalancePaise: netOutstandingPaise,
            totalCreditPaise: customer.totalCreditPaise,
            totalPaymentPaise: customer.totalPaymentPaise,
            transactionCount: customer.transactionCount,
            dueDate: customer.dueDate || null,
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        );
        batch.commit().catch((err) => {
          console.warn('Firestore updateTransaction error:', err);
        });
      } catch (err) {
        console.warn('Firestore updateTransaction error:', err);
      }
    }

    return { success: true, newBalancePaise: netOutstandingPaise };
  },

  /**
   * Deletes a financial transaction and recalculates customer balance atomically.
   */
  async deleteTransaction(
    businessId: string,
    transactionId: string
  ): Promise<{ success: boolean; error?: string; newBalancePaise: number }> {
    const transactions = await StorageService.getTransactions(businessId);
    const customers = await StorageService.getCustomers(businessId);

    const targetTx = transactions.find((t) => t.id === transactionId);
    if (!targetTx) {
      return { success: false, error: 'Transaction not found', newBalancePaise: 0 };
    }

    // Identify linked paired transactions (e.g. counter sale paired with payment)
    const txIdsToDelete = new Set<string>([transactionId]);
    if (targetTx.type === 'CREDIT_SALE') {
      const linkedPayment = transactions.find(
        (t) => t.type === 'PAYMENT' && t.referenceNumber === targetTx.id
      );
      if (linkedPayment) {
        txIdsToDelete.add(linkedPayment.id);
      }
    } else if (targetTx.type === 'PAYMENT' && targetTx.referenceNumber?.startsWith('tx_')) {
      const linkedSale = transactions.find(
        (t) => t.type === 'CREDIT_SALE' && t.id === targetTx.referenceNumber && t.isCounterSale
      );
      if (linkedSale) {
        txIdsToDelete.add(linkedSale.id);
      }
    }

    const remainingTxs = transactions.filter((t) => !txIdsToDelete.has(t.id));

    const custIndex = customers.findIndex((c) => c.id === targetTx.customerId);
    let newBalance = 0;
    if (custIndex >= 0) {
      const customer = customers[custIndex];
      const custTxs = remainingTxs.filter((t) => t.customerId === customer.id && !t.isReversed);
      const { totalCreditPaise, totalPaymentPaise, netOutstandingPaise, transactionCount } =
        calculateCustomerBalance(customer.openingBalancePaise, custTxs);

      customer.totalCreditPaise = totalCreditPaise;
      customer.totalPaymentPaise = totalPaymentPaise;
      customer.currentBalancePaise = netOutstandingPaise;
      customer.transactionCount = transactionCount;
      customer.dueDate = calculateCustomerDueDate(custTxs, netOutstandingPaise);
      customer.updatedAt = new Date().toISOString();

      customers[custIndex] = customer;
      newBalance = netOutstandingPaise;
    }

    await StorageService.saveTransactions(businessId, remainingTxs);
    await StorageService.saveCustomers(businessId, customers);

    if (isFirebaseConfigured() && db) {
      try {
        for (const id of txIdsToDelete) {
          deleteDoc(doc(db, 'transactions', id)).catch((err) => {
            console.warn('Firestore deleteTransaction error:', err);
          });
        }
        if (custIndex >= 0) {
          const customer = customers[custIndex];
          setDoc(doc(db, 'customers', customer.id), cleanForFirestore({
            ...customer,
            serverTimestamp: serverTimestamp(),
          })).catch((err) => {
            console.warn('Firestore deleteTransaction customer sync error:', err);
          });
        }
      } catch (err) {
        console.warn('Firestore deleteTransaction error:', err);
      }
    }

    return { success: true, newBalancePaise: newBalance };
  },

  // -------------------------------------------------------------
  // AGGREGATIONS & REPORTS
  // -------------------------------------------------------------
  async getDashboardData(businessId: string): Promise<DashboardMetrics> {
    const [customers, transactions, villages] = await Promise.all([
      this.getCustomers(businessId),
      this.getTransactions(businessId),
      this.getVillages(businessId),
    ]);
    return calculateDashboardMetrics(customers, transactions, villages.length);
  },

  async getVillageSummaries(businessId: string, includeUnassigned: boolean = false): Promise<VillageSummary[]> {
    const [villages, customers] = await Promise.all([
      this.getVillages(businessId),
      this.getCustomers(businessId),
    ]);
    return calculateVillageSummaries(villages, customers, includeUnassigned);
  },

  // -------------------------------------------------------------
  // SEED SAMPLE DATA (Matching user's handwritten ledger image)
  // -------------------------------------------------------------
  async seedDemoData(businessId: string): Promise<void> {
    const defaultBusiness: Business = {
      id: businessId,
      name: 'श्री गणेश खाद एवं बीज भण्डार (Kisan Agro)',
      ownerName: 'रामेश्वर दयाल',
      phone: '9896012345',
      address: 'मुख्य बाजार, मण्डी गेट के पास',
      upiId: 'kisanagro@upi',
      currency: 'INR',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await StorageService.setCurrentBusiness(defaultBusiness);

    // Villages
    const v1: Village = {
      id: 'vil_sikandarpur',
      businessId,
      name: 'सिकन्दरपुर (Sikandarpur)',
      nameHindi: 'सिकन्दरपुर',
      status: 'ACTIVE',
      createdAt: '2025-12-01T00:00:00Z',
      updatedAt: '2025-12-01T00:00:00Z',
    };
    const v2: Village = {
      id: 'vil_rampur',
      businessId,
      name: 'रामपुर (Rampur)',
      nameHindi: 'रामपुर',
      status: 'ACTIVE',
      createdAt: '2025-12-01T00:00:00Z',
      updatedAt: '2025-12-01T00:00:00Z',
    };
    const v3: Village = {
      id: 'vil_mohanpur',
      businessId,
      name: 'मोहनपुर (Mohanpur)',
      nameHindi: 'मोहनपुर',
      status: 'ACTIVE',
      createdAt: '2025-12-01T00:00:00Z',
      updatedAt: '2025-12-01T00:00:00Z',
    };
    await StorageService.saveVillages(businessId, [v1, v2, v3]);

    // Customers: Shivnandan from Sikandarpur (from reference image) + 2 more
    const c1: Customer = {
      id: 'cust_shivnandan',
      businessId,
      name: 'शिवनन्दन (Shivnandan)',
      mobile: '9876543210',
      villageId: v1.id,
      villageName: v1.name,
      address: 'सिकन्दरपुर',
      openingBalancePaise: toPaise(0),
      currentBalancePaise: 0,
      totalCreditPaise: 0,
      totalPaymentPaise: 0,
      transactionCount: 0,
      status: 'ACTIVE',
      createdAt: '2025-12-31T09:00:00Z',
      updatedAt: '2026-08-17T18:00:00Z',
    };

    const c2: Customer = {
      id: 'cust_manoj',
      businessId,
      name: 'मनोज कुमार (Manoj Kumar)',
      mobile: '9876500001',
      villageId: v1.id,
      villageName: v1.name,
      address: 'सिकन्दरपुर',
      openingBalancePaise: toPaise(1500),
      currentBalancePaise: toPaise(1500),
      totalCreditPaise: 0,
      totalPaymentPaise: 0,
      transactionCount: 0,
      status: 'ACTIVE',
      createdAt: '2026-01-10T09:00:00Z',
      updatedAt: '2026-01-10T09:00:00Z',
    };

    const c3: Customer = {
      id: 'cust_rajesh',
      businessId,
      name: 'राजेश पटेल (Rajesh Patel)',
      mobile: '9876500002',
      villageId: v2.id,
      villageName: v2.name,
      address: 'रामपुर',
      openingBalancePaise: toPaise(2800),
      currentBalancePaise: toPaise(2800),
      totalCreditPaise: 0,
      totalPaymentPaise: 0,
      transactionCount: 0,
      status: 'ACTIVE',
      createdAt: '2026-02-15T09:00:00Z',
      updatedAt: '2026-02-15T09:00:00Z',
    };

    await StorageService.saveCustomers(businessId, [c1, c2, c3]);

    // Exact transactions from the handwritten ledger photo:
    // 31/12/25: 260
    // 05/01/26: 200
    // 05/01/26: 460 जमा
    // 25/04/26: 220
    // 25/04/26: 220 जमा
    // 14/06/26: धान 2250
    // 14/06/26: 2200
    // 30/07/26: डिसेस इमामेक्टीन मुन्नू मनोज 755
    // 30/07/26: 320 मक्का वाले
    // 07/08/26: टेम्पो अल्ट्राजीन मनोज 380
    // 17/08/26: डिसेस इमेक्टीन मुन्नू 525

    const txRecords: Transaction[] = [
      {
        id: 'tx_sn_1',
        businessId,
        customerId: c1.id,
        type: 'CREDIT_SALE',
        amountPaise: toPaise(260),
        description: 'उधार सामान',
        date: '2025-12-31',
        createdAt: '2025-12-31T10:00:00Z',
      },
      {
        id: 'tx_sn_2',
        businessId,
        customerId: c1.id,
        type: 'CREDIT_SALE',
        amountPaise: toPaise(200),
        description: 'उधार सामान',
        date: '2026-01-05',
        createdAt: '2026-01-05T09:30:00Z',
      },
      {
        id: 'tx_sn_3',
        businessId,
        customerId: c1.id,
        type: 'PAYMENT',
        amountPaise: toPaise(460),
        description: '460 जमा (Cash Paid)',
        paymentMethod: 'CASH',
        date: '2026-01-05',
        createdAt: '2026-01-05T10:00:00Z',
      },
      {
        id: 'tx_sn_4',
        businessId,
        customerId: c1.id,
        type: 'CREDIT_SALE',
        amountPaise: toPaise(220),
        description: 'उधार सामान',
        date: '2026-04-25',
        createdAt: '2026-04-25T11:00:00Z',
      },
      {
        id: 'tx_sn_5',
        businessId,
        customerId: c1.id,
        type: 'PAYMENT',
        amountPaise: toPaise(220),
        description: '220 जमा',
        paymentMethod: 'CASH',
        date: '2026-04-25',
        createdAt: '2026-04-25T11:30:00Z',
      },
      {
        id: 'tx_sn_6',
        businessId,
        customerId: c1.id,
        type: 'CREDIT_SALE',
        amountPaise: toPaise(2250),
        description: 'धान (Dhan Seeds)',
        date: '2026-06-14',
        createdAt: '2026-06-14T09:00:00Z',
      },
      {
        id: 'tx_sn_7',
        businessId,
        customerId: c1.id,
        type: 'PAYMENT',
        amountPaise: toPaise(2200),
        description: 'जमा (Payment received)',
        paymentMethod: 'CASH',
        date: '2026-06-14',
        createdAt: '2026-06-14T10:00:00Z',
      },
      {
        id: 'tx_sn_8',
        businessId,
        customerId: c1.id,
        type: 'CREDIT_SALE',
        amountPaise: toPaise(755),
        description: 'डिसेस इमामेक्टीन मुन्नू, मनोज',
        date: '2026-07-30',
        createdAt: '2026-07-30T10:00:00Z',
      },
      {
        id: 'tx_sn_9',
        businessId,
        customerId: c1.id,
        type: 'PAYMENT',
        amountPaise: toPaise(320),
        description: '320 मक्का वाले',
        paymentMethod: 'CASH',
        date: '2026-07-30',
        createdAt: '2026-07-30T14:00:00Z',
      },
      {
        id: 'tx_sn_10',
        businessId,
        customerId: c1.id,
        type: 'CREDIT_SALE',
        amountPaise: toPaise(380),
        description: 'टेम्पो अल्ट्राजीन मनोज',
        date: '2026-08-07',
        createdAt: '2026-08-07T11:00:00Z',
      },
      {
        id: 'tx_sn_11',
        businessId,
        customerId: c1.id,
        type: 'CREDIT_SALE',
        amountPaise: toPaise(525),
        description: 'डिसेस इमेक्टीन मुन्नू',
        date: '2026-08-17',
        createdAt: '2026-08-17T12:00:00Z',
      },
    ];

    // Compute balance for c1
    const { totalCreditPaise, totalPaymentPaise, netOutstandingPaise, transactionCount } =
      calculateCustomerBalance(c1.openingBalancePaise, txRecords);

    c1.totalCreditPaise = totalCreditPaise;
    c1.totalPaymentPaise = totalPaymentPaise;
    c1.currentBalancePaise = netOutstandingPaise;
    c1.transactionCount = transactionCount;

    await StorageService.saveTransactions(businessId, txRecords);
    await StorageService.saveCustomers(businessId, [c1, c2, c3]);
  },

  // -------------------------------------------------------------
  // PRODUCTS / RATE MASTER
  // -------------------------------------------------------------
  async getProducts(businessId: string, forceRefresh = false): Promise<Product[]> {
    let localProducts = await StorageService.getProducts(businessId);

    // Sanitize any existing local cache immediately (purges auto-seeded demo items)
    const { cleaned: sanitizedLocal, hadSeed: hadLocalSeed } = sanitizeProductList(localProducts);
    if (hadLocalSeed) {
      localProducts = sanitizedLocal;
      await StorageService.saveProducts(businessId, sanitizedLocal);
    }

    // If Firebase is configured, try loading from Firestore
    if (isFirebaseConfigured() && db) {
      // Fast path: if not forceRefresh and we already have local, return immediately and sync background
      if (!forceRefresh && localProducts.length > 0) {
        // Sync in background from business doc
        getDoc(doc(db, 'businesses', businessId))
          .then(async (bizDoc) => {
            if (bizDoc.exists()) {
              const bizData = bizDoc.data();
              if (bizData && Array.isArray(bizData.productsCatalog)) {
                const { cleaned: sanitizedRemote, hadSeed } = sanitizeProductList(bizData.productsCatalog as Product[]);
                await StorageService.saveProducts(businessId, sanitizedRemote);
                if (hadSeed) {
                  // Purge demo items from remote business doc too
                  setDoc(
                    doc(db, 'businesses', businessId),
                    cleanForFirestore({
                      productsCatalog: sanitizedRemote,
                      productsUpdatedAt: new Date().toISOString(),
                    }),
                    { merge: true }
                  ).catch(() => {});
                }
              }
            }
          })
          .catch(() => {});
        return [...localProducts];
      }

      // Initial load or forceRefresh: check business doc first (guaranteed permitted in cloud rules)
      try {
        const bizDoc = await getDoc(doc(db, 'businesses', businessId));
        if (bizDoc.exists()) {
          const bizData = bizDoc.data();
          if (bizData && Array.isArray(bizData.productsCatalog)) {
            const { cleaned: remoteProducts, hadSeed } = sanitizeProductList(bizData.productsCatalog as Product[]);
            await StorageService.saveProducts(businessId, remoteProducts);
            if (hadSeed) {
              setDoc(
                doc(db, 'businesses', businessId),
                cleanForFirestore({
                  productsCatalog: remoteProducts,
                  productsUpdatedAt: new Date().toISOString(),
                }),
                { merge: true }
              ).catch(() => {});
            }
            return [...remoteProducts];
          }
        }
      } catch (err) {
        console.warn('Firestore getProducts from business doc error:', err);
      }

      // Fallback: check products collection
      try {
        const snap = await getDocs(query(collection(db, 'products'), where('businessId', '==', businessId)));
        if (!snap.empty) {
          const rawList = snap.docs.map((d) => d.data() as Product);
          const { cleaned: list, hadSeed } = sanitizeProductList(rawList);
          await StorageService.saveProducts(businessId, list);
          // Backport to business doc so it is accessible
          setDoc(
            doc(db, 'businesses', businessId),
            cleanForFirestore({
              productsCatalog: list,
              productsUpdatedAt: new Date().toISOString(),
            }),
            { merge: true }
          ).catch(() => {});

          // If hadSeed, clean standalone docs
          if (hadSeed) {
            snap.docs.forEach((d) => {
              if (d.id.startsWith('prod_seed_')) {
                deleteDoc(d.ref).catch(() => {});
              }
            });
          }
          return [...list];
        }
      } catch (err) {
        console.warn('Firestore getProducts error, using local:', err);
      }
    }

    // Return strictly what the business has (or empty array [] if none) - NEVER auto-seed!
    return [...localProducts];
  },

  async seedPreloadedProducts(businessId: string): Promise<Product[]> {
    const now = new Date().toISOString();
    const seeded: Product[] = PRELOADED_TYCOON_PRODUCTS.map((p, idx) => ({
      ...p,
      id: `prod_seed_${idx + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      businessId,
      createdAt: now,
      updatedAt: now,
    }));

    await StorageService.saveProducts(businessId, seeded);

    // Sync to Firestore in background
    if (isFirebaseConfigured() && db) {
      // 1. Save to business doc (ALWAYS PERMITTED)
      setDoc(
        doc(db, 'businesses', businessId),
        cleanForFirestore({
          productsCatalog: seeded,
          productsUpdatedAt: now,
        }),
        { merge: true }
      ).catch(() => {});

      // 2. Also try individual product docs
      Promise.all(
        seeded.map((p) =>
          setDoc(doc(db, 'products', p.id), cleanForFirestore({ ...p, serverTimestamp: serverTimestamp() }), { merge: true }).catch(() => {})
        )
      ).catch(() => {});
    }

    return seeded;
  },

  async saveProduct(product: Product): Promise<{ success: boolean; error?: string }> {
    const products = await StorageService.getProducts(product.businessId);

    // Check duplicate (same brand name, product name, and pack size)
    const duplicate = products.find(
      (p) =>
        p.id !== product.id &&
        p.brandName.trim().toLowerCase() === product.brandName.trim().toLowerCase() &&
        p.productName.trim().toLowerCase() === product.productName.trim().toLowerCase() &&
        p.packSize.trim().toLowerCase() === product.packSize.trim().toLowerCase()
    );
    if (duplicate) {
      return { success: false, error: 'A product with this Brand, Name and Pack Size already exists' };
    }

    const index = products.findIndex((p) => p.id === product.id);
    if (index >= 0) {
      products[index] = { ...product, updatedAt: new Date().toISOString() };
    } else {
      products.unshift({ ...product, createdAt: product.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
    }

    await StorageService.saveProducts(product.businessId, products);

    if (isFirebaseConfigured() && db) {
      try {
        // 1. Update businesses/{businessId} doc (ALWAYS PERMITTED by cloud rules)
        setDoc(
          doc(db, 'businesses', product.businessId),
          cleanForFirestore({
            productsCatalog: products,
            productsUpdatedAt: new Date().toISOString(),
          }),
          { merge: true }
        ).catch((err) => console.warn('Firestore saveProduct to business doc error:', err));

        // 2. Also update standalone products collection
        setDoc(
          doc(db, 'products', product.id),
          cleanForFirestore({
            ...product,
            serverTimestamp: serverTimestamp(),
          })
        ).catch((err) => console.warn('Firestore saveProduct error:', err));
      } catch (err) {
        console.warn('Firestore saveProduct sync error:', err);
      }
    }

    return { success: true };
  },

  async deleteProduct(businessId: string, productId: string): Promise<{ success: boolean; error?: string }> {
    const products = await StorageService.getProducts(businessId);
    const filtered = products.filter((p) => p.id !== productId);
    await StorageService.saveProducts(businessId, filtered);

    if (isFirebaseConfigured() && db) {
      try {
        // 1. Update businesses/{businessId} doc (ALWAYS PERMITTED)
        setDoc(
          doc(db, 'businesses', businessId),
          cleanForFirestore({
            productsCatalog: filtered,
            productsUpdatedAt: new Date().toISOString(),
          }),
          { merge: true }
        ).catch((err) => console.warn('Firestore deleteProduct from business doc error:', err));

        // 2. Also delete from standalone products collection
        deleteDoc(doc(db, 'products', productId)).catch((err) =>
          console.warn('Firestore deleteProduct error:', err)
        );
      } catch (err) {
        console.warn('Firestore deleteProduct sync error:', err);
      }
    }

    return { success: true };
  },

  async getProductByBarcode(businessId: string, rawBarcode: string): Promise<Product | null> {
    if (!rawBarcode || !rawBarcode.trim()) return null;
    const clean = rawBarcode.trim();
    const products = await this.getProducts(businessId);
    const found = products.find(
      (p) =>
        p.isActive !== false &&
        (p.barcode === clean ||
          (p.secondaryBarcodes && p.secondaryBarcodes.includes(clean)))
    );
    return found || null;
  },

  async isBarcodeUsed(
    businessId: string,
    rawBarcode: string,
    excludeProductId?: string
  ): Promise<{ isUsed: boolean; product?: Product }> {
    if (!rawBarcode || !rawBarcode.trim()) return { isUsed: false };
    const clean = rawBarcode.trim();
    const products = await this.getProducts(businessId);
    const found = products.find(
      (p) =>
        p.id !== excludeProductId &&
        (p.barcode === clean ||
          (p.secondaryBarcodes && p.secondaryBarcodes.includes(clean)))
    );
    return found ? { isUsed: true, product: found } : { isUsed: false };
  },

  async linkProductBarcode(
    businessId: string,
    productId: string,
    rawBarcode: string
  ): Promise<{ success: boolean; product?: Product; error?: string }> {
    if (!rawBarcode || !rawBarcode.trim()) {
      return { success: false, error: 'Invalid barcode' };
    }
    const clean = rawBarcode.trim();
    const check = await this.isBarcodeUsed(businessId, clean, productId);
    if (check.isUsed && check.product) {
      return {
        success: false,
        error: `यह बारकोड पहले से "${check.product.productName} (${check.product.packSize})" पर रजिस्टर्ड है।`,
      };
    }

    const products = await StorageService.getProducts(businessId);
    const prod = products.find((p) => p.id === productId);
    if (!prod) {
      return { success: false, error: 'उत्पाद नहीं मिला' };
    }

    prod.barcode = clean;
    prod.updatedAt = new Date().toISOString();
    await this.saveProduct(prod);
    return { success: true, product: prod };
  },

  // -------------------------------------------------------------
  // UNIT OF MEASUREMENT (UOM)
  // -------------------------------------------------------------
  async getUOMs(businessId: string): Promise<UnitOfMeasurement[]> {
    let localList = await StorageService.getUOMs(businessId);

    // Seed defaults if empty
    if (localList.length === 0) {
      const seeded: UnitOfMeasurement[] = SYSTEM_DEFAULT_UOMS.map((u) => ({
        ...u,
        businessId,
      }));
      await StorageService.saveUOMs(businessId, seeded);
      localList = seeded;

      if (isFirebaseConfigured() && db) {
        setDoc(
          doc(db, 'businesses', businessId),
          cleanForFirestore({
            uomMaster: seeded,
            uomUpdatedAt: new Date().toISOString(),
          }),
          { merge: true }
        ).catch(() => {});
      }
    }

    // Background sync from Firestore if connected
    if (isFirebaseConfigured() && db) {
      getDoc(doc(db, 'businesses', businessId))
        .then((bDoc) => {
          if (bDoc.exists()) {
            const data = bDoc.data();
            if (Array.isArray(data?.uomMaster) && data.uomMaster.length > 0) {
              StorageService.saveUOMs(businessId, data.uomMaster).catch(() => {});
            }
          }
        })
        .catch(() => {});
    }

    return localList;
  },

  async saveUOM(uom: UnitOfMeasurement): Promise<{ success: boolean; uom: UnitOfMeasurement }> {
    const list = await this.getUOMs(uom.businessId);
    const index = list.findIndex((u) => u.id === uom.id);
    const now = new Date().toISOString();
    let savedItem: UnitOfMeasurement;

    if (index >= 0) {
      savedItem = { ...uom, updatedAt: now };
      list[index] = savedItem;
    } else {
      savedItem = { ...uom, createdAt: uom.createdAt || now, updatedAt: now };
      list.push(savedItem);
    }

    await StorageService.saveUOMs(uom.businessId, list);

    if (isFirebaseConfigured() && db) {
      setDoc(
        doc(db, 'businesses', uom.businessId),
        cleanForFirestore({
          uomMaster: list,
          uomUpdatedAt: now,
        }),
        { merge: true }
      ).catch((err) => console.warn('Firestore saveUOM error:', err));
    }

    return { success: true, uom: savedItem };
  },

  async deleteUOM(businessId: string, uomId: string): Promise<{ success: boolean; error?: string }> {
    const list = await this.getUOMs(businessId);
    const target = list.find((u) => u.id === uomId);
    if (target?.isSystemDefault) {
      return { success: false, error: 'सिस्टम डिफ़ॉल्ट इकाई को हटाया नहीं जा सकता।' };
    }
    const filtered = list.filter((u) => u.id !== uomId);
    await StorageService.saveUOMs(businessId, filtered);

    if (isFirebaseConfigured() && db) {
      setDoc(
        doc(db, 'businesses', businessId),
        cleanForFirestore({
          uomMaster: filtered,
          uomUpdatedAt: new Date().toISOString(),
        }),
        { merge: true }
      ).catch((err) => console.warn('Firestore deleteUOM error:', err));
    }

    return { success: true };
  },

  // -------------------------------------------------------------
  // UNIT CONVERSIONS
  // -------------------------------------------------------------
  async getUOMConversions(businessId: string): Promise<UnitConversion[]> {
    let localList = await StorageService.getUOMConversions(businessId);

    if (localList.length === 0) {
      const seeded: UnitConversion[] = SYSTEM_DEFAULT_CONVERSIONS.map((c) => ({
        ...c,
        businessId,
      }));
      await StorageService.saveUOMConversions(businessId, seeded);
      localList = seeded;

      if (isFirebaseConfigured() && db) {
        setDoc(
          doc(db, 'businesses', businessId),
          cleanForFirestore({
            uomConversions: seeded,
            uomConversionsUpdatedAt: new Date().toISOString(),
          }),
          { merge: true }
        ).catch(() => {});
      }
    }

    if (isFirebaseConfigured() && db) {
      getDoc(doc(db, 'businesses', businessId))
        .then((bDoc) => {
          if (bDoc.exists()) {
            const data = bDoc.data();
            if (Array.isArray(data?.uomConversions) && data.uomConversions.length > 0) {
              StorageService.saveUOMConversions(businessId, data.uomConversions).catch(() => {});
            }
          }
        })
        .catch(() => {});
    }

    return localList;
  },

  async saveUOMConversion(conv: UnitConversion): Promise<{ success: boolean; conversion: UnitConversion }> {
    const list = await this.getUOMConversions(conv.businessId);
    const index = list.findIndex((c) => c.id === conv.id);
    const now = new Date().toISOString();
    let savedItem: UnitConversion;

    if (index >= 0) {
      savedItem = { ...conv, updatedAt: now };
      list[index] = savedItem;
    } else {
      savedItem = { ...conv, createdAt: conv.createdAt || now, updatedAt: now };
      list.push(savedItem);
    }

    await StorageService.saveUOMConversions(conv.businessId, list);

    if (isFirebaseConfigured() && db) {
      setDoc(
        doc(db, 'businesses', conv.businessId),
        cleanForFirestore({
          uomConversions: list,
          uomConversionsUpdatedAt: now,
        }),
        { merge: true }
      ).catch((err) => console.warn('Firestore saveUOMConversion error:', err));
    }

    return { success: true, conversion: savedItem };
  },

  async deleteUOMConversion(businessId: string, conversionId: string): Promise<{ success: boolean; error?: string }> {
    const list = await this.getUOMConversions(businessId);
    const filtered = list.filter((c) => c.id !== conversionId);
    await StorageService.saveUOMConversions(businessId, filtered);

    if (isFirebaseConfigured() && db) {
      setDoc(
        doc(db, 'businesses', businessId),
        cleanForFirestore({
          uomConversions: filtered,
          uomConversionsUpdatedAt: new Date().toISOString(),
        }),
        { merge: true }
      ).catch((err) => console.warn('Firestore deleteUOMConversion error:', err));
    }

    return { success: true };
  },

  // -------------------------------------------------------------
  // SUPPLIERS (Vendors / Dealers)
  // -------------------------------------------------------------
  async getSuppliers(businessId: string): Promise<Supplier[]> {
    let local = await StorageService.getSuppliers(businessId);
    if (isFirebaseConfigured() && db) {
      try {
        const snap = await getDocs(query(collection(db, 'suppliers'), where('businessId', '==', businessId)));
        if (!snap.empty) {
          const remoteList = snap.docs.map((d) => d.data() as Supplier);
          const mergedMap = new Map<string, Supplier>();
          remoteList.forEach((s) => mergedMap.set(s.id, s));
          local.forEach((s) => {
            if (!mergedMap.has(s.id)) {
              mergedMap.set(s.id, s);
            }
          });
          const merged = Array.from(mergedMap.values()).sort(
            (a, b) => (a.name || '').localeCompare(b.name || '')
          );
          await StorageService.saveSuppliers(businessId, merged);
          return merged;
        }
      } catch (err) {
        console.warn('Firestore getSuppliers error:', err);
      }
    }
    return local;
  },

  async saveSupplier(supplier: Supplier): Promise<{ success: boolean; supplier?: Supplier; error?: string }> {
    try {
      const list = await StorageService.getSuppliers(supplier.businessId);
      const idx = list.findIndex((s) => s.id === supplier.id);
      const savedItem: Supplier = {
        ...supplier,
        updatedAt: new Date().toISOString(),
      };

      if (idx >= 0) {
        list[idx] = savedItem;
      } else {
        list.unshift(savedItem);
      }

      await StorageService.saveSuppliers(supplier.businessId, list);

      if (isFirebaseConfigured() && db) {
        setDoc(
          doc(db, 'suppliers', supplier.id),
          cleanForFirestore({
            ...savedItem,
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        ).catch((err) => console.warn('Firestore saveSupplier error:', err));
      }

      return { success: true, supplier: savedItem };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async deleteSupplier(businessId: string, supplierId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const list = await StorageService.getSuppliers(businessId);
      const filtered = list.filter((s) => s.id !== supplierId);
      await StorageService.saveSuppliers(businessId, filtered);

      if (isFirebaseConfigured() && db) {
        deleteDoc(doc(db, 'suppliers', supplierId)).catch((err) => console.warn('Firestore deleteSupplier error:', err));
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // -------------------------------------------------------------
  // PURCHASES (Inward Bills)
  // -------------------------------------------------------------
  async getPurchases(businessId: string): Promise<PurchaseInvoice[]> {
    let local = await StorageService.getPurchases(businessId);
    if (isFirebaseConfigured() && db) {
      try {
        const snap = await getDocs(query(collection(db, 'purchases'), where('businessId', '==', businessId)));
        if (!snap.empty) {
          const remoteList = snap.docs.map((d) => d.data() as PurchaseInvoice);
          const mergedMap = new Map<string, PurchaseInvoice>();
          remoteList.forEach((p) => mergedMap.set(p.id, p));
          local.forEach((p) => {
            if (!mergedMap.has(p.id)) {
              mergedMap.set(p.id, p);
            }
          });
          const merged = Array.from(mergedMap.values()).sort(
            (a, b) => new Date(b.createdAt || b.invoiceDate).getTime() - new Date(a.createdAt || a.invoiceDate).getTime()
          );
          await StorageService.savePurchases(businessId, merged);
          return merged;
        }
      } catch (err) {
        console.warn('Firestore getPurchases error:', err);
      }
    }
    return local;
  },

  async savePurchase(purchase: PurchaseInvoice): Promise<{ success: boolean; purchase?: PurchaseInvoice; error?: string }> {
    try {
      const list = await StorageService.getPurchases(purchase.businessId);
      const idx = list.findIndex((p) => p.id === purchase.id);
      const oldPurchase = idx >= 0 ? list[idx] : null;
      const savedItem: PurchaseInvoice = {
        ...purchase,
        updatedAt: new Date().toISOString(),
      };

      if (idx >= 0) {
        list[idx] = savedItem;
      } else {
        list.unshift(savedItem);
      }

      await StorageService.savePurchases(purchase.businessId, list);

      // Also update supplier outstanding balance and total purchases
      const suppliers = await StorageService.getSuppliers(purchase.businessId);
      let suppliersChanged = false;

      // If supplier changed on edit, revert old supplier balances first
      if (oldPurchase && oldPurchase.supplierId && oldPurchase.supplierId !== purchase.supplierId) {
        const oldSIdx = suppliers.findIndex((s) => s.id === oldPurchase.supplierId);
        if (oldSIdx >= 0) {
          const oldSup = suppliers[oldSIdx];
          const updatedOldSup: Supplier = {
            ...oldSup,
            totalPurchasePaise: Math.max(0, (oldSup.totalPurchasePaise || 0) - oldPurchase.totalAmountPaise),
            totalPaidPaise: Math.max(0, (oldSup.totalPaidPaise || 0) - (oldPurchase.paidAmountPaise || 0)),
            currentOutstandingPaise: Math.max(0, (oldSup.currentOutstandingPaise || 0) - (oldPurchase.dueAmountPaise || 0)),
            updatedAt: new Date().toISOString(),
          };
          suppliers[oldSIdx] = updatedOldSup;
          suppliersChanged = true;

          if (isFirebaseConfigured() && db) {
            setDoc(
              doc(db, 'suppliers', oldSup.id),
              cleanForFirestore({
                ...updatedOldSup,
                updatedAt: serverTimestamp(),
              }),
              { merge: true }
            ).catch((err) => console.warn('Firestore revert old supplier on purchase edit error:', err));
          }
        }
      }

      if (purchase.supplierId) {
        const sIdx = suppliers.findIndex((s) => s.id === purchase.supplierId);
        if (sIdx >= 0) {
          const sup = suppliers[sIdx];
          const prevTotal = oldPurchase && oldPurchase.supplierId === purchase.supplierId ? oldPurchase.totalAmountPaise : 0;
          const prevPaid = oldPurchase && oldPurchase.supplierId === purchase.supplierId ? (oldPurchase.paidAmountPaise || 0) : 0;
          const prevDue = oldPurchase && oldPurchase.supplierId === purchase.supplierId ? (oldPurchase.dueAmountPaise || 0) : 0;

          const updatedSupplier: Supplier = {
            ...sup,
            totalPurchasePaise: Math.max(0, (sup.totalPurchasePaise || 0) - prevTotal + purchase.totalAmountPaise),
            totalPaidPaise: Math.max(0, (sup.totalPaidPaise || 0) - prevPaid + (purchase.paidAmountPaise || 0)),
            currentOutstandingPaise: Math.max(0, (sup.currentOutstandingPaise || 0) - prevDue + (purchase.dueAmountPaise || 0)),
            updatedAt: new Date().toISOString(),
          };
          suppliers[sIdx] = updatedSupplier;
          suppliersChanged = true;

          if (isFirebaseConfigured() && db) {
            setDoc(
              doc(db, 'suppliers', sup.id),
              cleanForFirestore({
                ...updatedSupplier,
                updatedAt: serverTimestamp(),
              }),
              { merge: true }
            ).catch((err) => console.warn('Firestore update supplier on purchase error:', err));
          }
        }
      }

      if (suppliersChanged) {
        await StorageService.saveSuppliers(purchase.businessId, suppliers);
      }

      if (isFirebaseConfigured() && db) {
        const firestoreData: any = { ...savedItem };
        // Cloud Firestore documents must be strictly under 1,048,576 bytes.
        // If billPhotoUri > 400KB, omit it from the remote Firestore doc to avoid Firebase document size errors
        if (firestoreData.billPhotoUri && firestoreData.billPhotoUri.length > 500000) {
          delete firestoreData.billPhotoUri;
        }

        setDoc(
          doc(db, 'purchases', purchase.id),
          cleanForFirestore({
            ...firestoreData,
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        ).catch((err) => console.warn('Firestore savePurchase error:', err));
      }

      return { success: true, purchase: savedItem };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async deletePurchase(businessId: string, purchaseId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const list = await StorageService.getPurchases(businessId);
      const toDelete = list.find((p) => p.id === purchaseId);
      const filtered = list.filter((p) => p.id !== purchaseId);
      await StorageService.savePurchases(businessId, filtered);
      AttachmentService.remove(purchaseId);

      // Revert supplier balance if needed
      if (toDelete && toDelete.supplierId) {
        const suppliers = await StorageService.getSuppliers(businessId);
        const sIdx = suppliers.findIndex((s) => s.id === toDelete.supplierId);
        if (sIdx >= 0) {
          const sup = suppliers[sIdx];
          const updatedSupplier: Supplier = {
            ...sup,
            totalPurchasePaise: Math.max(0, (sup.totalPurchasePaise || 0) - toDelete.totalAmountPaise),
            totalPaidPaise: Math.max(0, (sup.totalPaidPaise || 0) - (toDelete.paidAmountPaise || 0)),
            currentOutstandingPaise: Math.max(0, (sup.currentOutstandingPaise || 0) - (toDelete.dueAmountPaise || 0)),
            updatedAt: new Date().toISOString(),
          };
          suppliers[sIdx] = updatedSupplier;
          await StorageService.saveSuppliers(businessId, suppliers);

          if (isFirebaseConfigured() && db) {
            setDoc(
              doc(db, 'suppliers', sup.id),
              cleanForFirestore({
                ...updatedSupplier,
                updatedAt: serverTimestamp(),
              }),
              { merge: true }
            ).catch((err) => console.warn('Firestore update supplier on delete purchase error:', err));
          }
        }
      }

      if (isFirebaseConfigured() && db) {
        deleteDoc(doc(db, 'purchases', purchaseId)).catch((err) => console.warn('Firestore deletePurchase error:', err));
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // -------------------------------------------------------------
  // SUPPLIER PAYMENTS
  // -------------------------------------------------------------
  async getSupplierPayments(businessId: string, supplierId?: string): Promise<SupplierPayment[]> {
    const list = await StorageService.getSupplierPayments(businessId);
    if (supplierId) {
      return list.filter((p) => p.supplierId === supplierId);
    }
    return list;
  },

  async saveSupplierPayment(payment: SupplierPayment): Promise<{ success: boolean; payment?: SupplierPayment; error?: string }> {
    try {
      const list = await StorageService.getSupplierPayments(payment.businessId);
      list.unshift(payment);
      await StorageService.saveSupplierPayments(payment.businessId, list);

      // Reduce supplier due balance
      const suppliers = await StorageService.getSuppliers(payment.businessId);
      const sIdx = suppliers.findIndex((s) => s.id === payment.supplierId);
      if (sIdx >= 0) {
        const sup = suppliers[sIdx];
        const updatedSupplier: Supplier = {
          ...sup,
          totalPaidPaise: (sup.totalPaidPaise || 0) + payment.amountPaise,
          currentOutstandingPaise: Math.max(0, (sup.currentOutstandingPaise || 0) - payment.amountPaise),
          updatedAt: new Date().toISOString(),
        };
        suppliers[sIdx] = updatedSupplier;
        await StorageService.saveSuppliers(payment.businessId, suppliers);

        if (isFirebaseConfigured() && db) {
          setDoc(
            doc(db, 'suppliers', sup.id),
            cleanForFirestore({
              ...updatedSupplier,
              updatedAt: serverTimestamp(),
            }),
            { merge: true }
          ).catch((err) => console.warn('Firestore update supplier payment error:', err));
        }
      }

      if (isFirebaseConfigured() && db) {
        setDoc(
          doc(db, 'supplier_payments', payment.id),
          cleanForFirestore({
            ...payment,
            createdAt: serverTimestamp(),
          }),
          { merge: true }
        ).catch((err) => console.warn('Firestore saveSupplierPayment error:', err));
      }

      return { success: true, payment };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // -------------------------------------------------------------
  // STOCK ADJUSTMENTS (Damaged, Expiry, Physical Count Audit)
  // -------------------------------------------------------------
  async getStockAdjustments(businessId: string): Promise<StockAdjustment[]> {
    let local = await StorageService.getStockAdjustments(businessId);
    if (isFirebaseConfigured() && db) {
      try {
        const snap = await getDocs(query(collection(db, 'stock_adjustments'), where('businessId', '==', businessId)));
        if (!snap.empty) {
          const remoteList = snap.docs.map((d) => d.data() as StockAdjustment);
          const mergedMap = new Map<string, StockAdjustment>();
          remoteList.forEach((a) => mergedMap.set(a.id, a));
          local.forEach((a) => {
            if (!mergedMap.has(a.id)) {
              mergedMap.set(a.id, a);
            }
          });
          const merged = Array.from(mergedMap.values()).sort(
            (a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime()
          );
          await StorageService.saveStockAdjustments(businessId, merged);
          return merged;
        }
      } catch (err) {
        console.warn('Firestore getStockAdjustments error:', err);
      }
    }
    return local;
  },

  async saveStockAdjustment(
    adj: StockAdjustment
  ): Promise<{ success: boolean; adjustment?: StockAdjustment; error?: string }> {
    try {
      const list = await StorageService.getStockAdjustments(adj.businessId);
      const idx = list.findIndex((a) => a.id === adj.id);
      const now = new Date().toISOString();
      const savedItem: StockAdjustment = {
        ...adj,
        updatedAt: now,
      };

      if (idx >= 0) {
        list[idx] = savedItem;
      } else {
        list.unshift(savedItem);
      }

      await StorageService.saveStockAdjustments(adj.businessId, list);

      if (isFirebaseConfigured() && db) {
        setDoc(
          doc(db, 'stock_adjustments', adj.id),
          cleanForFirestore({
            ...savedItem,
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        ).catch((err) => console.warn('Firestore saveStockAdjustment error:', err));
      }

      return { success: true, adjustment: savedItem };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async deleteStockAdjustment(
    businessId: string,
    adjustmentId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const list = await StorageService.getStockAdjustments(businessId);
      const filtered = list.filter((a) => a.id !== adjustmentId);
      await StorageService.saveStockAdjustments(businessId, filtered);

      if (isFirebaseConfigured() && db) {
        deleteDoc(doc(db, 'stock_adjustments', adjustmentId)).catch((err) =>
          console.warn('Firestore deleteStockAdjustment error:', err)
        );
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // -------------------------------------------------------------
  // LIVE STOCK LEDGER SUMMARY (Purchases - Sales + Adjustments = Available Stock)
  // -------------------------------------------------------------
  async getStockLedgerSummary(businessId: string): Promise<StockItemSummary[]> {
    const [products, purchases, transactions, adjustments] = await Promise.all([
      this.getProducts(businessId),
      this.getPurchases(businessId),
      this.getTransactions(businessId),
      this.getStockAdjustments(businessId),
    ]);

    const summaries: StockItemSummary[] = products
      .filter((p) => p.isActive)
      .map((p) => {
        const idKey = p.id;
        const nameKey = (p.productName || '').toLowerCase().trim();
        const brandKey = (p.brandName || '').toLowerCase().trim();
        const packKey = (p.packSize || '').toLowerCase().trim();

        // Calculate total purchased base units for this product
        let totalPurchased = 0;
        for (const pur of purchases) {
          for (const item of pur.items || []) {
            const matchesId = Boolean(item.productId && item.productId === idKey);
            const itemName = (item.productName || '').toLowerCase().trim();
            const matchesName = Boolean(itemName && nameKey && itemName === nameKey);
            if (matchesId || (!item.productId && matchesName)) {
              totalPurchased += (item.totalBaseUnits || item.purchaseQty || 0);
            }
          }
        }

        // Calculate total sold units from transactions
        let totalSold = 0;
        for (const tx of transactions) {
          if (tx.type === 'CREDIT_SALE' && !tx.isReversed) {
            const desc = (tx.description || '').toLowerCase().trim();
            if (desc && nameKey) {
              const exactMatch = desc === nameKey;
              const containsBoth = brandKey ? desc.includes(nameKey) && desc.includes(brandKey) : desc.includes(nameKey);
              if (exactMatch || containsBoth) {
                totalSold += (tx.quantity || 1);
              }
            }
          }
        }

        // Calculate net adjustments (+ surplus / - damage, expiry, loss)
        let netAdjusted = 0;
        for (const adj of adjustments) {
          const matchesId = Boolean(adj.productId && adj.productId === idKey);
          const adjName = (adj.productName || '').toLowerCase().trim();
          const matchesName = Boolean(adjName && nameKey && adjName === nameKey);
          if (matchesId || (!adj.productId && matchesName)) {
            const qty = Math.abs(adj.quantityBaseUnits || 0);
            const isSurplus = adj.adjustmentType === 'AUDIT_SURPLUS' || adj.adjustmentType === 'MANUAL_IN';
            netAdjusted += (isSurplus ? qty : -qty);
          }
        }

        const currentStock = Math.max(0, totalPurchased - totalSold + netAdjusted);

        const unitsPerCase = p.unitsPerCase || p.conversionFactor || 10;
        const cases = Math.floor(currentStock / unitsPerCase);
        const loose = currentStock % unitsPerCase;

        const unitCost = p.withGstRatePaise || p.billingRatePaise || 0;
        const totalValue = currentStock * unitCost;

        let status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' = 'IN_STOCK';
        if (currentStock <= 0) {
          status = 'OUT_OF_STOCK';
        } else if (currentStock <= 5) {
          status = 'LOW_STOCK';
        }

        return {
          productId: p.id,
          productName: p.productName,
          brandName: p.brandName,
          category: p.category,
          packSize: p.packSize,
          casePacking: p.casePacking,
          unitsPerCase,
          caseVolumeOrWeight: p.caseVolumeOrWeight,
          sellingUnit: p.primarySellingUnit || p.unit || 'Piece',
          purchasePackagingUnit: p.purchasePackagingUnit || 'Box',
          totalPurchasedBaseUnits: totalPurchased,
          totalSoldBaseUnits: totalSold,
          totalAdjustedBaseUnits: netAdjusted,
          currentStockBaseUnits: currentStock,
          currentStockCases: cases,
          currentStockLooseUnits: loose,
          unitCostPaise: unitCost,
          totalStockValuePaise: totalValue,
          status,
        };
      });

    return summaries;
  },

  // -------------------------------------------------------------
  // DAILY PETTY EXPENSES
  // -------------------------------------------------------------
  async getDailyExpenses(businessId: string, date?: string): Promise<DailyExpenseItem[]> {
    const local = await StorageService.getDailyExpenses(businessId, date);
    if (isFirebaseConfigured() && db) {
      try {
        let q = query(collection(db, 'daily_expenses'), where('businessId', '==', businessId));
        if (date) {
          q = query(collection(db, 'daily_expenses'), where('businessId', '==', businessId), where('date', '==', date));
        }
        const snap = await getDocs(q);
        if (!snap.empty) {
          const remoteMap = new Map<string, DailyExpenseItem>();
          snap.docs.forEach((d) => remoteMap.set(d.id, { ...(d.data() as any), id: d.id }));
          const allCurrent = await StorageService.getDailyExpenses(businessId);
          allCurrent.forEach((item) => {
            if (!remoteMap.has(item.id)) remoteMap.set(item.id, item);
          });
          const merged = Array.from(remoteMap.values());
          await StorageService.saveDailyExpenses(businessId, merged);
          return date ? merged.filter((e) => e.date === date) : merged;
        }
      } catch (err) {
        console.warn('Firestore getDailyExpenses sync error:', err);
      }
    }
    return local;
  },

  async saveDailyExpense(expense: DailyExpenseItem): Promise<{ success: boolean; expense?: DailyExpenseItem; error?: string }> {
    try {
      const all = await StorageService.getDailyExpenses(expense.businessId);
      const idx = all.findIndex((e) => e.id === expense.id);
      const savedItem = { ...expense, updatedAt: new Date().toISOString() };
      if (idx >= 0) {
        all[idx] = savedItem;
      } else {
        all.unshift(savedItem);
      }
      await StorageService.saveDailyExpenses(expense.businessId, all);

      if (isFirebaseConfigured() && db) {
        setDoc(
          doc(db, 'daily_expenses', expense.id),
          cleanForFirestore({
            ...savedItem,
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        ).catch((err) => console.warn('Firestore saveDailyExpense error:', err));
      }
      return { success: true, expense: savedItem };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async deleteDailyExpense(businessId: string, expenseId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const all = await StorageService.getDailyExpenses(businessId);
      const filtered = all.filter((e) => e.id !== expenseId);
      await StorageService.saveDailyExpenses(businessId, filtered);

      if (isFirebaseConfigured() && db) {
        deleteDoc(doc(db, 'daily_expenses', expenseId)).catch((err) =>
          console.warn('Firestore deleteDailyExpense error:', err)
        );
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // -------------------------------------------------------------
  // DAILY CASH CLOSINGS (Galla Reconciliation)
  // -------------------------------------------------------------
  async getDailyCashClosings(businessId: string): Promise<DailyCashClosing[]> {
    const local = await StorageService.getDailyCashClosings(businessId);
    if (isFirebaseConfigured() && db) {
      try {
        const snap = await getDocs(
          query(collection(db, 'daily_cash_closings'), where('businessId', '==', businessId))
        );
        if (!snap.empty) {
          const remoteMap = new Map<string, DailyCashClosing>();
          snap.docs.forEach((d) => remoteMap.set(d.id, { ...(d.data() as any), id: d.id }));
          local.forEach((c) => {
            if (!remoteMap.has(c.id)) remoteMap.set(c.id, c);
          });
          const merged = Array.from(remoteMap.values());
          await StorageService.saveDailyCashClosings(businessId, merged);
          return merged;
        }
      } catch (err) {
        console.warn('Firestore getDailyCashClosings sync error:', err);
      }
    }
    return local;
  },

  async getDailyCashClosing(businessId: string, date: string): Promise<DailyCashClosing | null> {
    const list = await this.getDailyCashClosings(businessId);
    return list.find((c) => c.date === date) || null;
  },

  async saveDailyCashClosing(closing: DailyCashClosing): Promise<{ success: boolean; closing?: DailyCashClosing; error?: string }> {
    try {
      const list = await StorageService.getDailyCashClosings(closing.businessId);
      const idx = list.findIndex((c) => c.id === closing.id || c.date === closing.date);
      const savedItem = { ...closing, updatedAt: new Date().toISOString() };
      // Once locked, it permanently remains locked
      if (idx >= 0 && list[idx].isLocked) {
        savedItem.isLocked = true;
      }
      if (idx >= 0) {
        list[idx] = savedItem;
      } else {
        list.unshift(savedItem);
      }
      await StorageService.saveDailyCashClosings(closing.businessId, list);

      if (isFirebaseConfigured() && db) {
        setDoc(
          doc(db, 'daily_cash_closings', closing.id),
          cleanForFirestore({
            ...savedItem,
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        ).catch((err) => console.warn('Firestore saveDailyCashClosing error:', err));
      }
      return { success: true, closing: savedItem };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Dynamically calculates full daily cash flow summary for a given business and date,
   * enforces ₹0 opening cash by default (customer feedback: retailer takes cash home),
   * auto-locks closing at 9:00 PM IST, and aggregates all transactions for that date.
   */
  async calculateDailyCashSummary(businessId: string, targetDate: string): Promise<{
    openingCashPaise: number;
    cashSalesPaise: number;
    cashRecoveriesPaise: number;
    cashSupplierPaidPaise: number;
    cashExpensesPaise: number;
    expectedCashPaise: number;
    upiSalesPaise: number;
    upiRecoveriesPaise: number;
    upiExpensesPaise: number;
    creditSalesPaise: number;
    totalDaySalesPaise: number;
    totalDayCollectionsPaise: number;
    existingClosing: DailyCashClosing | null;
    isAutoLocked: boolean;
    dayTransactions: DayTransactionItem[];
  }> {
    const [txs, purchases, supPayments, expenses, closings, customers] = await Promise.all([
      this.getTransactions(businessId),
      this.getPurchases(businessId),
      this.getSupplierPayments(businessId),
      this.getDailyExpenses(businessId, targetDate),
      this.getDailyCashClosings(businessId),
      this.getCustomers(businessId),
    ]);

    const custMap = new Map<string, string>();
    customers.forEach((c) => {
      if (c.id && c.name) custMap.set(c.id, c.name);
    });

    let existingClosing = closings.find((c) => c.date === targetDate) || null;

    // 1. OPENING CASH:
    // Default to ₹0 every day.
    // Retailers take their balance home at night and bring fresh cash (or 0) in the morning.
    // If a closing was already saved with a custom opening for this date, use that opening cash.
    let openingCashPaise = 0;
    if (existingClosing) {
      openingCashPaise = existingClosing.openingCashPaise || 0;
    }

    let cashSalesPaise = 0;
    let cashRecoveriesPaise = 0;
    let upiSalesPaise = 0;
    let upiRecoveriesPaise = 0;
    let creditSalesPaise = 0;

    const dayTransactions: DayTransactionItem[] = [];

    for (const t of txs) {
      const tDate = t.date ? t.date.split('T')[0] : '';
      if (tDate !== targetDate) continue;

      const pMethod = t.paymentMethod || 'CASH';
      const custName = custMap.get(t.customerId) || t.customerName || (t.isCounterSale ? 'काउंटर नकद ग्राहक' : 'ग्राहक');
      const timeStr = t.createdAt ? new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

      if (t.type === 'CREDIT_SALE') {
        const totalBill = t.amountPaise || 0;
        const recv = t.receivedAmountPaise || 0;
        const unpaidUdhaar = Math.max(0, totalBill - recv);
        creditSalesPaise += unpaidUdhaar;

        if (unpaidUdhaar > 0) {
          dayTransactions.push({
            id: `${t.id}_credit`,
            timeStr,
            partyName: custName,
            type: 'CREDIT_SALE',
            typeLabelHi: 'उधार बिक्री (खाता)',
            amountPaise: unpaidUdhaar,
            paymentMethod: 'CREDIT',
            description: t.description || 'उधार सामान',
            isDebitOrCredit: 'IN',
          });
        }

        if (recv > 0) {
          if (pMethod === 'UPI') {
            upiSalesPaise += recv;
          } else {
            cashSalesPaise += recv;
          }

          dayTransactions.push({
            id: `${t.id}_cash`,
            timeStr,
            partyName: custName,
            type: 'CASH_SALE',
            typeLabelHi: pMethod === 'UPI' ? 'ऑनलाइन बिक्री (UPI)' : 'नकद बिक्री (गल्ला)',
            amountPaise: recv,
            paymentMethod: pMethod === 'UPI' ? 'UPI' : 'CASH',
            description: t.description || 'नकद बिलिंग',
            isDebitOrCredit: 'IN',
          });
        }
      } else if (t.type === 'PAYMENT') {
        // Skip payments recorded at the exact time of sale (already accounted for via receivedAmountPaise above)
        if (
          (t.referenceNumber && t.referenceNumber.startsWith('tx_') && !t.referenceNumber.startsWith('tx_pay_')) ||
          (t.idempotencyKey && t.idempotencyKey.startsWith('idemp_pay_sale_'))
        ) {
          continue;
        }
        if (pMethod === 'UPI') {
          upiRecoveriesPaise += t.amountPaise || 0;
        } else {
          cashRecoveriesPaise += t.amountPaise || 0;
        }

        dayTransactions.push({
          id: t.id,
          timeStr,
          partyName: custName,
          type: 'RECOVERY',
          typeLabelHi: pMethod === 'UPI' ? 'उधारी वसूली (UPI)' : 'उधारी वसूली (नकद)',
          amountPaise: t.amountPaise || 0,
          paymentMethod: pMethod === 'UPI' ? 'UPI' : 'CASH',
          description: t.description || 'उधारी जमा',
          isDebitOrCredit: 'IN',
        });
      }
    }

    let cashSupplierPaidPaise = 0;
    for (const p of purchases) {
      const pDate = p.invoiceDate || (p.createdAt ? p.createdAt.split('T')[0] : '');
      if (pDate === targetDate && (p.paidAmountPaise || 0) > 0) {
        const pMethod = p.paymentMethod || 'CASH';
        if (pMethod === 'CASH') {
          cashSupplierPaidPaise += p.paidAmountPaise;
        }
        const timeStr = p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        dayTransactions.push({
          id: p.id,
          timeStr,
          partyName: p.supplierName || 'सप्लायर',
          type: 'SUPPLIER_PAYMENT',
          typeLabelHi: pMethod === 'CASH' ? 'सप्लायर खरीद (नकद दिया)' : 'सप्लायर खरीद (UPI)',
          amountPaise: p.paidAmountPaise,
          paymentMethod: pMethod === 'CASH' ? 'CASH' : 'UPI',
          description: `बिल #${p.invoiceNo || p.id.substring(0, 8)}`,
          isDebitOrCredit: 'OUT',
        });
      }
    }

    for (const sp of supPayments) {
      const spDate = sp.date ? sp.date.split('T')[0] : (sp.createdAt ? sp.createdAt.split('T')[0] : '');
      if (spDate === targetDate && (sp.amountPaise || 0) > 0) {
        const spMethod = sp.paymentMethod || 'CASH';
        if (spMethod === 'CASH') {
          cashSupplierPaidPaise += sp.amountPaise;
        }
        const timeStr = sp.createdAt ? new Date(sp.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        dayTransactions.push({
          id: sp.id,
          timeStr,
          partyName: sp.supplierName || 'सप्लायर',
          type: 'SUPPLIER_PAYMENT',
          typeLabelHi: spMethod === 'CASH' ? 'सप्लायर भुगतान (नकद)' : 'सप्लायर भुगतान (UPI)',
          amountPaise: sp.amountPaise,
          paymentMethod: spMethod === 'CASH' ? 'CASH' : 'UPI',
          description: sp.notes || 'सप्लायर खाता भुगतान',
          isDebitOrCredit: 'OUT',
        });
      }
    }

    let cashExpensesPaise = 0;
    let upiExpensesPaise = 0;
    for (const exp of expenses) {
      if (exp.paymentMethod === 'UPI') {
        upiExpensesPaise += exp.amountPaise || 0;
      } else {
        cashExpensesPaise += exp.amountPaise || 0;
      }
      const timeStr = exp.createdAt ? new Date(exp.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      dayTransactions.push({
        id: exp.id,
        timeStr,
        partyName: exp.paidTo || exp.title || 'दुकान खर्च',
        type: 'EXPENSE',
        typeLabelHi: exp.paymentMethod === 'UPI' ? 'दुकान खर्च (UPI)' : 'दुकान खर्च (गल्ला नकद)',
        amountPaise: exp.amountPaise || 0,
        paymentMethod: exp.paymentMethod === 'UPI' ? 'UPI' : 'CASH',
        description: exp.title || 'विविध खर्च',
        isDebitOrCredit: 'OUT',
      });
    }

    const expectedCashPaise = Math.max(
      0,
      openingCashPaise + cashSalesPaise + cashRecoveriesPaise - cashSupplierPaidPaise - cashExpensesPaise
    );
    const totalDaySalesPaise = cashSalesPaise + upiSalesPaise + creditSalesPaise;
    const totalDayCollectionsPaise = cashSalesPaise + upiSalesPaise + cashRecoveriesPaise + upiRecoveriesPaise;

    // 2. AUTO-LOCK AT 9:00 PM (21:00 IST):
    // Automatically close day and lock cash drawer at 9:00 PM or for any past date
    const past9PM = isDayPast9PM(targetDate);
    if (past9PM) {
      if (!existingClosing) {
        // Auto-generate locked day closing
        const autoClosing: DailyCashClosing = {
          id: `close_${targetDate}`,
          businessId,
          date: targetDate,
          closedAt: new Date().toISOString(),
          closedBy: 'सिस्टम (ऑटो 9:00 PM)',
          openingCashPaise,
          cashSalesPaise,
          cashRecoveriesPaise,
          cashSupplierPaidPaise,
          cashExpensesPaise,
          expectedCashPaise,
          denominations: {
            note500: 0,
            note200: 0,
            note100: 0,
            note50: 0,
            note20: 0,
            note10: 0,
            coins: 0,
          },
          physicalCashPaise: expectedCashPaise,
          variancePaise: 0,
          varianceReason: 'रात 9:00 बजे ऑटोमैटिक दिन समाप्त व गल्ला लॉक',
          upiSalesPaise,
          upiRecoveriesPaise,
          upiExpensesPaise,
          creditSalesPaise,
          totalDaySalesPaise,
          totalDayCollectionsPaise,
          isLocked: true,
          notes: 'रात 9:00 बजे ऑटोमैटिक सिस्टम द्वारा गल्ला लॉक किया गया',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await this.saveDailyCashClosing(autoClosing);
        existingClosing = autoClosing;
      } else if (!existingClosing.isLocked) {
        // Automatically lock existing draft closing
        existingClosing.isLocked = true;
        existingClosing.updatedAt = new Date().toISOString();
        if (!existingClosing.notes) {
          existingClosing.notes = 'रात 9:00 बजे ऑटोमैटिक सिस्टम द्वारा गल्ला लॉक किया गया';
        }
        await this.saveDailyCashClosing(existingClosing);
      }
    }

    return {
      openingCashPaise,
      cashSalesPaise,
      cashRecoveriesPaise,
      cashSupplierPaidPaise,
      cashExpensesPaise,
      expectedCashPaise,
      upiSalesPaise,
      upiRecoveriesPaise,
      upiExpensesPaise,
      creditSalesPaise,
      totalDaySalesPaise,
      totalDayCollectionsPaise,
      existingClosing,
      isAutoLocked: past9PM || Boolean(existingClosing?.isLocked),
      dayTransactions,
    };
  },

  // -------------------------------------------------------------
  // CLEAR ALL DATA (Reset)
  // -------------------------------------------------------------
  async clearAllData(businessId: string, requestingUserEmail?: string | null): Promise<void> {
    if (!businessId) {
      throw new Error('businessId is required to clear data.');
    }

    // LAYER 1: Hard Protection for Sukhveer / Legacy Master Store (NEVER allow wiping)
    if (businessId === LEGACY_BUSINESS_ID || businessId === LEGACY_BUSINESS_TENANT_ID) {
      throw new Error('सुरक्षा प्रतिबंध: मुख्य/सुरक्षित स्टोर (Kushi kersi seva kendar) का डेटा मिटाना सख्त मना है!');
    }

    // LAYER 2: Strict Tenant Ownership Check
    if (requestingUserEmail) {
      const ownBizId = getBusinessIdFromEmail(requestingUserEmail);
      if (businessId !== ownBizId) {
        throw new Error('सुरक्षा प्रतिबंध: आप केवल अपने ही स्टोर का डेटा मिटा सकते हैं! अन्य यूज़र का डेटा सुरक्षित है।');
      }
    }

    // 1. Clear local storage and memory cache ONLY for this businessId
    await StorageService.clearBusinessData(businessId);
    await StorageService.saveCustomers(businessId, []);
    await StorageService.saveVillages(businessId, []);
    await StorageService.saveTransactions(businessId, []);
    await StorageService.saveProducts(businessId, []);

    // 2. If Firebase is active, delete records from Firestore strictly matching this businessId
    if (isFirebaseConfigured() && db) {
      try {
        const collections = ['customers', 'villages', 'transactions', 'products'];
        for (const colName of collections) {
          const snap = await getDocs(query(collection(db, colName), where('businessId', '==', businessId)));
          const deletes = snap.docs.map((docSnap) => deleteDoc(docSnap.ref));
          await Promise.all(deletes);
        }
      } catch (err) {
        console.warn('Firestore clearAllData error:', err);
      }
    }
  },
};

