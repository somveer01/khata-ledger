import { DataRepository } from '../src/services/db';
import { StorageService } from '../src/services/storage';
import { toPaise, toRupees } from '../src/utils/money';
import { Transaction } from '../src/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDocs: jest.fn().mockResolvedValue({ docs: [], empty: true }),
  getDoc: jest.fn().mockResolvedValue({ exists: () => false, data: () => null }),
  setDoc: jest.fn().mockResolvedValue(undefined),
  deleteDoc: jest.fn().mockResolvedValue(undefined),
  query: jest.fn(),
  where: jest.fn(),
  serverTimestamp: jest.fn(),
}));

jest.mock('../src/services/firebase', () => ({
  db: null,
  isFirebaseConfigured: () => false,
}));

describe('Daily Cash Closing Reconciliation Tests', () => {
  const testBizId = 'biz_test_closing_store';
  const targetDate = '2026-11-23';

  beforeEach(async () => {
    await AsyncStorage.clear();
    StorageService.clearMemoryCache();
  });

  test('Reconciliation: Cash Sale + UPI Sale + Partial Udhaar + Recovery calculates Total Sales, Credit Given, UPI and Collections accurately', async () => {
    // 1. Pure Cash Counter Sale ₹500
    // 2. Pure UPI Counter Sale ₹300
    // 3. Farmer Udhaar ₹1,000 with ₹200 cash upfront (Credit Given = ₹800)
    // 4. Old Udhaar Recovery ₹400 (₹200 Cash + ₹200 UPI)
    const testTxs: Transaction[] = [
      {
        id: 'tx_sale_1',
        businessId: testBizId,
        customerId: 'cust_counter',
        type: 'CREDIT_SALE',
        amountPaise: toPaise(500),
        receivedAmountPaise: toPaise(500),
        paymentMethod: 'CASH',
        description: 'DAP 1 Bag',
        isCounterSale: true,
        date: targetDate,
        createdAt: '2026-11-23T10:00:00Z',
      },
      {
        id: 'tx_pay_sale_1',
        businessId: testBizId,
        customerId: 'cust_counter',
        type: 'PAYMENT',
        amountPaise: toPaise(500),
        paymentMethod: 'CASH',
        referenceNumber: 'tx_sale_1',
        description: 'Counter Cash Sale Payment',
        date: targetDate,
        createdAt: '2026-11-23T10:00:01Z',
      },
      {
        id: 'tx_sale_2',
        businessId: testBizId,
        customerId: 'cust_counter',
        type: 'CREDIT_SALE',
        amountPaise: toPaise(300),
        receivedAmountPaise: toPaise(300),
        paymentMethod: 'UPI',
        description: 'Spray Bottle',
        isCounterSale: true,
        date: targetDate,
        createdAt: '2026-11-23T11:00:00Z',
      },
      {
        id: 'tx_pay_sale_2',
        businessId: testBizId,
        customerId: 'cust_counter',
        type: 'PAYMENT',
        amountPaise: toPaise(300),
        paymentMethod: 'UPI',
        referenceNumber: 'tx_sale_2',
        description: 'Counter UPI Sale Payment',
        date: targetDate,
        createdAt: '2026-11-23T11:00:01Z',
      },
      {
        id: 'tx_sale_3',
        businessId: testBizId,
        customerId: 'cust_farmer_ramesh',
        type: 'CREDIT_SALE',
        amountPaise: toPaise(1000),
        receivedAmountPaise: toPaise(200),
        paymentMethod: 'CASH',
        description: 'Urea 2 Bags',
        date: targetDate,
        createdAt: '2026-11-23T12:00:00Z',
      },
      {
        id: 'tx_pay_sale_3',
        businessId: testBizId,
        customerId: 'cust_farmer_ramesh',
        type: 'PAYMENT',
        amountPaise: toPaise(200),
        paymentMethod: 'CASH',
        referenceNumber: 'tx_sale_3',
        description: 'Received on Sale',
        date: targetDate,
        createdAt: '2026-11-23T12:00:01Z',
      },
      // Old Udhaar Recoveries (from earlier days)
      {
        id: 'tx_rec_cash',
        businessId: testBizId,
        customerId: 'cust_farmer_suresh',
        type: 'PAYMENT',
        amountPaise: toPaise(200),
        paymentMethod: 'CASH',
        description: 'Purani Udhaar Cash Jama',
        date: targetDate,
        createdAt: '2026-11-23T14:00:00Z',
      },
      {
        id: 'tx_rec_upi',
        businessId: testBizId,
        customerId: 'cust_farmer_mahesh',
        type: 'PAYMENT',
        amountPaise: toPaise(200),
        paymentMethod: 'UPI',
        description: 'Purani Udhaar Online Jama',
        date: targetDate,
        createdAt: '2026-11-23T15:00:00Z',
      },
    ];

    await StorageService.saveTransactions(testBizId, testTxs);

    const summary = await DataRepository.calculateDailyCashSummary(testBizId, targetDate);

    // 1. Total Day Sales = Cash Sales (500 + 200 = 700) + UPI Sales (300) + Credit Given (800) = ₹1,800
    expect(toRupees(summary.totalDaySalesPaise)).toBe(1800);

    // 2. Credit Given (नई उधारी) = ₹800 (from Sale 3: 1000 - 200)
    expect(toRupees(summary.creditSalesPaise)).toBe(800);

    // 3. Cash Sales (बिक्री पर नकद) = ₹700 (Sale 1: 500 + Sale 3: 200)
    expect(toRupees(summary.cashSalesPaise)).toBe(700);

    // 4. UPI Sales (बिक्री पर UPI) = ₹300 (Sale 2: 300)
    expect(toRupees(summary.upiSalesPaise)).toBe(300);

    // 5. Total UPI Inflow = UPI Sales (300) + UPI Recoveries (200) = ₹500
    expect(toRupees(summary.upiSalesPaise + summary.upiRecoveriesPaise)).toBe(500);

    // 6. Total Collections (कुल वसूली) = Cash Sales (700) + UPI Sales (300) + Cash Rec (200) + UPI Rec (200) = ₹1,400
    expect(toRupees(summary.totalDayCollectionsPaise)).toBe(1400);

    // 7. Cash Drawer Inflow (दुकान में नकद आया) = Cash Sales (700) + Cash Rec (200) = ₹900
    expect(toRupees(summary.cashSalesPaise + summary.cashRecoveriesPaise)).toBe(900);
  });
});
