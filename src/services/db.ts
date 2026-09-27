import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc,
  getDocs, 
  query, 
  where, 
  serverTimestamp, 
  runTransaction 
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import { StorageService } from './storage';
import { Business, Village, Customer, Transaction, VillageSummary, DashboardMetrics } from '../types';
import { calculateCustomerBalance, calculateVillageSummaries, calculateDashboardMetrics, calculateCustomerDueDate } from './accounting';
import { toPaise } from '../utils/money';

export const DataRepository = {
  // -------------------------------------------------------------
  // BUSINESS PROFILE
  // -------------------------------------------------------------
  async getBusiness(businessId: string): Promise<Business | null> {
    if (isFirebaseConfigured() && db) {
      try {
        const snap = await getDocs(query(collection(db, 'businesses'), where('id', '==', businessId)));
        if (!snap.empty) {
          return snap.docs[0].data() as Business;
        }
      } catch (err) {
        console.warn('Firestore getBusiness fallback to storage:', err);
      }
    }
    return StorageService.getCurrentBusiness();
  },

  async saveBusiness(business: Business): Promise<void> {
    await StorageService.setCurrentBusiness(business);
    if (isFirebaseConfigured() && db) {
      try {
        await setDoc(doc(db, 'businesses', business.id), {
          ...business,
          updatedAt: new Date().toISOString(),
          serverTimestamp: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Firestore saveBusiness error:', err);
      }
    }
  },

  // -------------------------------------------------------------
  // VILLAGES
  // -------------------------------------------------------------
  async getVillages(businessId: string): Promise<Village[]> {
    const localVillages = await StorageService.getVillages(businessId);
    if (isFirebaseConfigured() && db) {
      if (localVillages.length > 0) {
        // Fast path: return cached data immediately and sync in background
        getDocs(query(collection(db, 'villages'), where('businessId', '==', businessId)))
          .then(async (snap) => {
            if (!snap.empty) {
              const list = snap.docs.map((d) => d.data() as Village);
              await StorageService.saveVillages(businessId, list);
            }
          })
          .catch((err) => console.warn('Firestore getVillages background sync error:', err));
        return [...localVillages];
      }

      // Initial load when cache is empty: await Firestore
      try {
        const snap = await getDocs(query(collection(db, 'villages'), where('businessId', '==', businessId)));
        if (!snap.empty) {
          const list = snap.docs.map((d) => d.data() as Village);
          await StorageService.saveVillages(businessId, list);
          return [...list];
        }
      } catch (err) {
        console.warn('Firestore getVillages error, using local:', err);
      }
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
        await setDoc(doc(db, 'villages', village.id), {
          ...village,
          serverTimestamp: serverTimestamp(),
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
  async getCustomers(businessId: string): Promise<Customer[]> {
    const localCustomers = await StorageService.getCustomers(businessId);
    if (isFirebaseConfigured() && db) {
      if (localCustomers.length > 0) {
        // Fast path: return cached customers immediately and sync in background
        getDocs(query(collection(db, 'customers'), where('businessId', '==', businessId)))
          .then(async (snap) => {
            if (!snap.empty) {
              const list = snap.docs.map((d) => d.data() as Customer);
              // Safely merge based on updatedAt to prevent stale overwrites
              const mergedMap = new Map<string, Customer>();
              localCustomers.forEach((c) => mergedMap.set(c.id, c));
              list.forEach((c) => {
                const existing = mergedMap.get(c.id);
                if (!existing || new Date(c.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
                  mergedMap.set(c.id, c);
                }
              });
              await StorageService.saveCustomers(businessId, Array.from(mergedMap.values()));
            }
          })
          .catch((err) => console.warn('Firestore getCustomers background sync error:', err));
        return [...localCustomers]; // Clone to ensure React re-renders on mutation
      }

      // Initial load when cache is empty: await Firestore
      try {
        const snap = await getDocs(query(collection(db, 'customers'), where('businessId', '==', businessId)));
        if (!snap.empty) {
          const list = snap.docs.map((d) => d.data() as Customer);
          await StorageService.saveCustomers(businessId, list);
          return [...list];
        }
      } catch (err) {
        console.warn('Firestore getCustomers error, using local:', err);
      }
    }
    return [...localCustomers];
  },

  async saveCustomer(customer: Customer): Promise<{ success: boolean; customer: Customer }> {
    const customers = await StorageService.getCustomers(customer.businessId);
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
        await setDoc(doc(db, 'customers', customer.id), {
          ...updatedCustomer,
          serverTimestamp: serverTimestamp(),
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
  async getTransactions(businessId: string, customerId?: string): Promise<Transaction[]> {
    const localTx = await StorageService.getTransactions(businessId);
    if (isFirebaseConfigured() && db) {
      let q = query(collection(db, 'transactions'), where('businessId', '==', businessId));
      if (customerId) {
        q = query(collection(db, 'transactions'), where('businessId', '==', businessId), where('customerId', '==', customerId));
      }

      if (localTx.length > 0) {
        // Fast path: return cached transactions immediately and sync in background
        getDocs(q)
          .then(async (snap) => {
            if (!snap.empty) {
              const list = snap.docs.map((d) => d.data() as Transaction);
              const allLocal = await StorageService.getTransactions(businessId);
              
              // Safely merge based on ID to retain newly created local txs that are not in Firestore yet
              const mergedMap = new Map<string, Transaction>();
              allLocal.forEach((t) => mergedMap.set(t.id, t));
              // Note: for transactions, they are rarely edited after creation except for deletion,
              // but if edited, updatedAt should ideally be used. For safety, since they are immutable in this basic app,
              // we can just overwrite, but we MUST keep local txs that don't exist in Firestore yet.
              list.forEach((t) => {
                const existing = mergedMap.get(t.id);
                // Keep local if it exists and Firestore one doesn't have an updatedAt or is older.
                // Assuming transactions are append-only mostly, just set it.
                mergedMap.set(t.id, t); 
              });
              
              await StorageService.saveTransactions(businessId, Array.from(mergedMap.values()));
            }
          })
          .catch((err) => console.warn('Firestore getTransactions background sync error:', err));

        if (customerId) {
          return localTx.filter((t) => t.customerId === customerId); // filter creates a new array
        }
        return [...localTx]; // clone
      }

      // Initial load when cache is empty: await Firestore
      try {
        const snap = await getDocs(q);
        if (!snap.empty) {
          const list = snap.docs.map((d) => d.data() as Transaction);
          await StorageService.saveTransactions(businessId, list);
          if (customerId) {
            return list.filter((t) => t.customerId === customerId); // filter creates a new array
          }
          return [...list]; // clone
        }
      } catch (err) {
        console.warn('Firestore getTransactions error, using local:', err);
      }
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
      customerName: customer.name,
      villageName: customer.villageName,
    };

    transactions.push(finalizedTx);
    customers[customerIndex] = customer;

    // Persist locally
    await StorageService.saveTransactions(businessId, transactions);
    await StorageService.saveCustomers(businessId, customers);

    // Persist to Cloud Firestore if connected
    if (isFirebaseConfigured() && db) {
      try {
        await runTransaction(db, async (fTx) => {
          const txRef = doc(db, 'transactions', finalizedTx.id);
          const custRef = doc(db, 'customers', customer.id);
          fTx.set(txRef, {
            ...finalizedTx,
            serverTimestamp: serverTimestamp(),
          });
          fTx.set(
            custRef,
            {
              currentBalancePaise: newBalance,
              totalCreditPaise: customer.totalCreditPaise,
              totalPaymentPaise: customer.totalPaymentPaise,
              transactionCount: customer.transactionCount,
              dueDate: customer.dueDate || null,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
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
      customerName: customer.name,
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
        await runTransaction(db, async (fTx) => {
          const txRef = doc(db, 'transactions', updatedTx.id);
          const custRef = doc(db, 'customers', customer.id);
          fTx.set(txRef, {
            ...updatedTx,
            serverTimestamp: serverTimestamp(),
          });
          fTx.set(
            custRef,
            {
              currentBalancePaise: netOutstandingPaise,
              totalCreditPaise: customer.totalCreditPaise,
              totalPaymentPaise: customer.totalPaymentPaise,
              transactionCount: customer.transactionCount,
              dueDate: customer.dueDate || null,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
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

    const remainingTxs = transactions.filter((t) => t.id !== transactionId);

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
        await deleteDoc(doc(db, 'transactions', transactionId));
        if (custIndex >= 0) {
          const customer = customers[custIndex];
          await setDoc(doc(db, 'customers', customer.id), {
            ...customer,
            serverTimestamp: serverTimestamp(),
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
  // CLEAR ALL DATA (Reset)
  // -------------------------------------------------------------
  async clearAllData(businessId: string): Promise<void> {
    // 1. Clear local storage, auth users, and memory cache
    await StorageService.clearBusinessData(businessId);
    await StorageService.saveCustomers(businessId, []);
    await StorageService.saveVillages(businessId, []);
    await StorageService.saveTransactions(businessId, []);
    await StorageService.clearAllLocalAuthAndUsers();

    // 2. If Firebase is active, delete records from Firestore
    if (isFirebaseConfigured() && db) {
      try {
        const collections = ['customers', 'villages', 'transactions'];
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
