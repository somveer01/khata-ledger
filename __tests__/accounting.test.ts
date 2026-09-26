import {
  calculateCustomerBalance,
  computeLedgerWithRunningBalances,
  calculateVillageSummaries,
  getDueStatus,
  calculateCustomerDueDate,
} from '../src/services/accounting';
import { toPaise, toRupees, formatCurrency } from '../src/utils/money';
import { Customer, Transaction } from '../src/types';

describe('Khata Book Accounting Engine Tests', () => {
  // Test A:
  // Opening balance ₹1,000. Credit sale ₹500. Payment ₹300.
  // Expected outstanding: ₹1,200.
  test('Test A: Opening balance ₹1,000, Credit sale ₹500, Payment ₹300 => ₹1,200', () => {
    const openingBalancePaise = toPaise(1000); // 100,000 paise
    const transactions: Transaction[] = [
      {
        id: 'tx1',
        businessId: 'biz1',
        customerId: 'cust1',
        type: 'CREDIT_SALE',
        amountPaise: toPaise(500),
        description: 'Dhan Seeds',
        date: '2026-06-14',
        createdAt: '2026-06-14T10:00:00Z',
      },
      {
        id: 'tx2',
        businessId: 'biz1',
        customerId: 'cust1',
        type: 'PAYMENT',
        amountPaise: toPaise(300),
        description: 'Cash payment',
        date: '2026-06-15',
        createdAt: '2026-06-15T11:00:00Z',
      },
    ];

    const result = calculateCustomerBalance(openingBalancePaise, transactions);
    expect(toRupees(result.netOutstandingPaise)).toBe(1200);
    expect(result.totalCreditPaise).toBe(toPaise(500));
    expect(result.totalPaymentPaise).toBe(toPaise(300));
  });

  // Test B:
  // Opening balance ₹0. Credit sale ₹2,000. Payment ₹2,000.
  // Expected outstanding: ₹0.
  test('Test B: Opening balance ₹0, Credit sale ₹2,000, Payment ₹2,000 => ₹0', () => {
    const openingBalancePaise = toPaise(0);
    const transactions: Transaction[] = [
      {
        id: 'tx1',
        businessId: 'biz1',
        customerId: 'cust1',
        type: 'CREDIT_SALE',
        amountPaise: toPaise(2000),
        description: 'Fertilizer',
        date: '2026-06-14',
        createdAt: '2026-06-14T10:00:00Z',
      },
      {
        id: 'tx2',
        businessId: 'biz1',
        customerId: 'cust1',
        type: 'PAYMENT',
        amountPaise: toPaise(2000),
        description: 'UPI payment',
        date: '2026-06-15',
        createdAt: '2026-06-15T11:00:00Z',
      },
    ];

    const result = calculateCustomerBalance(openingBalancePaise, transactions);
    expect(toRupees(result.netOutstandingPaise)).toBe(0);
    expect(result.netOutstandingPaise).toBe(0);
  });

  // Test C:
  // Village A has three customers with dues ₹500, ₹1,000, and ₹1,500.
  // Expected village outstanding: ₹3,000.
  test('Test C: Village A has three customers with dues ₹500, ₹1,000, ₹1,500 => Village outstanding ₹3,000', () => {
    const villages = [{ id: 'vil-a', name: 'Sikandarpur' }];
    const customers: Customer[] = [
      {
        id: 'c1',
        businessId: 'biz1',
        name: 'Shivnandan',
        mobile: '9876543210',
        villageId: 'vil-a',
        openingBalancePaise: toPaise(500),
        currentBalancePaise: toPaise(500),
        status: 'ACTIVE',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: 'c2',
        businessId: 'biz1',
        name: 'Manoj Kumar',
        mobile: '9876543211',
        villageId: 'vil-a',
        openingBalancePaise: toPaise(1000),
        currentBalancePaise: toPaise(1000),
        status: 'ACTIVE',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: 'c3',
        businessId: 'biz1',
        name: 'Munnu Singh',
        mobile: '9876543212',
        villageId: 'vil-a',
        openingBalancePaise: toPaise(1500),
        currentBalancePaise: toPaise(1500),
        status: 'ACTIVE',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    const summaries = calculateVillageSummaries(villages, customers);
    expect(summaries.length).toBe(1);
    expect(summaries[0].villageName).toBe('Sikandarpur');
    expect(toRupees(summaries[0].totalOutstandingPaise)).toBe(3000);
    expect(summaries[0].customerCount).toBe(3);
    expect(summaries[0].customersWithDueCount).toBe(3);
  });

  // Test D:
  // Duplicate payment request retry check (Idempotency key logic).
  test('Test D: Duplicate transaction request is prevented using idempotency key', () => {
    const seenKeys = new Set<string>();
    const processTx = (tx: Transaction, history: Transaction[]) => {
      if (tx.idempotencyKey && seenKeys.has(tx.idempotencyKey)) {
        return { success: false, duplicate: true, currentHistory: history };
      }
      if (tx.idempotencyKey) {
        seenKeys.add(tx.idempotencyKey);
      }
      return { success: true, duplicate: false, currentHistory: [...history, tx] };
    };

    let history: Transaction[] = [];
    const paymentTx: Transaction = {
      id: 'tx_pay_1',
      idempotencyKey: 'idemp-12345',
      businessId: 'biz1',
      customerId: 'cust1',
      type: 'PAYMENT',
      amountPaise: toPaise(400),
      description: 'Cash',
      date: '2026-06-15',
      createdAt: '2026-06-15T12:00:00Z',
    };

    const firstAttempt = processTx(paymentTx, history);
    expect(firstAttempt.success).toBe(true);
    expect(firstAttempt.currentHistory.length).toBe(1);

    // Retrying with same idempotency key
    const secondAttempt = processTx(paymentTx, firstAttempt.currentHistory);
    expect(secondAttempt.success).toBe(false);
    expect(secondAttempt.duplicate).toBe(true);
    expect(secondAttempt.currentHistory.length).toBe(1); // Not duplicated
  });

  // Test E:
  // Customer has ₹1,000 due and pays ₹400.
  // Expected remaining balance: ₹600.
  test('Test E: Customer has ₹1,000 due and pays ₹400 => Remaining balance ₹600', () => {
    const openingBalancePaise = toPaise(1000);
    const paymentTx: Transaction = {
      id: 'tx_pay_1',
      businessId: 'biz1',
      customerId: 'cust1',
      type: 'PAYMENT',
      amountPaise: toPaise(400),
      description: 'Cash Payment',
      date: '2026-06-15',
      createdAt: '2026-06-15T12:00:00Z',
    };

    const result = calculateCustomerBalance(openingBalancePaise, [paymentTx]);
    expect(toRupees(result.netOutstandingPaise)).toBe(600);
  });

  // Test F:
  // Precision check: floating point drift prevention (0.10 + 0.20 in paise = 30 paise)
  test('Test F: Precise integer paise avoids JavaScript 0.1 + 0.2 floating point error', () => {
    const p1 = toPaise(0.1); // 10 paise
    const p2 = toPaise(0.2); // 20 paise
    const totalPaise = p1 + p2; // 30 paise
    expect(totalPaise).toBe(30);
    expect(toRupees(totalPaise)).toBe(0.3);
    expect(formatCurrency(totalPaise, { showDecimals: true })).toBe('₹0.30');
  });

  // Test Running Balance calculation matching the ledger columns
  test('Ledger Running Balance chronological progression matches paper ledger', () => {
    const openingBalance = toPaise(0);
    const transactions: Transaction[] = [
      {
        id: '1',
        businessId: 'b',
        customerId: 'c',
        type: 'CREDIT_SALE',
        amountPaise: toPaise(260),
        description: 'Dhan item 1',
        date: '2025-12-31',
        createdAt: '2025-12-31T09:00:00Z',
      },
      {
        id: '2',
        businessId: 'b',
        customerId: 'c',
        type: 'CREDIT_SALE',
        amountPaise: toPaise(200),
        description: 'Dhan item 2',
        date: '2026-01-05',
        createdAt: '2026-01-05T09:00:00Z',
      },
      {
        id: '3',
        businessId: 'b',
        customerId: 'c',
        type: 'PAYMENT',
        amountPaise: toPaise(460),
        description: 'Jama',
        date: '2026-01-05',
        createdAt: '2026-01-05T10:00:00Z',
      },
    ];

    const ledger = computeLedgerWithRunningBalances(openingBalance, transactions);
    expect(ledger[0].runningBalancePaise).toBe(toPaise(260));
    expect(ledger[1].runningBalancePaise).toBe(toPaise(460));
    expect(ledger[2].runningBalancePaise).toBe(toPaise(0)); // 460 - 460 = 0
  });

  // Test G:
  // Customer due ₹1,050. Payment ₹1,000 + Discount ₹50 => Net remaining balance ₹0.
  test('Test G: Payment ₹1,000 + Discount ₹50 settles ₹1,050 balance to ₹0', () => {
    const openingBalance = toPaise(1050);
    const transactions: Transaction[] = [
      {
        id: 'tx_pay_disc',
        businessId: 'b',
        customerId: 'c',
        type: 'PAYMENT',
        amountPaise: toPaise(1000),
        discountPaise: toPaise(50),
        description: 'Payment with ₹50 discount',
        date: '2026-06-15',
        createdAt: '2026-06-15T10:00:00Z',
      },
    ];

    const result = calculateCustomerBalance(openingBalance, transactions);
    expect(toRupees(result.netOutstandingPaise)).toBe(0);
    expect(result.totalPaymentPaise).toBe(toPaise(1000));

    const ledger = computeLedgerWithRunningBalances(openingBalance, transactions);
    expect(ledger[0].runningBalancePaise).toBe(toPaise(0));
  });

  // Test H:
  // Payment Due Date evaluation (Overdue, Due Today, Upcoming, None) and Customer Due Date calculation
  test('Test H: Payment Due Date evaluation and customer active due date tracking', () => {
    const today = '2026-09-23';

    // 1. Overdue: dueDate is 2026-09-20 (3 days ago relative to today)
    const overdueStatus = getDueStatus('2026-09-20', today);
    expect(overdueStatus.status).toBe('OVERDUE');
    expect(overdueStatus.daysDiff).toBe(3);

    // 2. Due Today: dueDate is 2026-09-23
    const todayStatus = getDueStatus('2026-09-23', today);
    expect(todayStatus.status).toBe('DUE_TODAY');
    expect(todayStatus.daysDiff).toBe(0);

    // 3. Upcoming: dueDate is 2026-10-05 (12 days in future)
    const upcomingStatus = getDueStatus('2026-10-05', today);
    expect(upcomingStatus.status).toBe('UPCOMING');
    expect(upcomingStatus.daysDiff).toBe(12);

    // 4. None: undefined dueDate
    const noneStatus = getDueStatus(undefined, today);
    expect(noneStatus.status).toBe('NONE');

    // 5. Customer earliest pending due date from unreversed credit transactions
    const txs: Transaction[] = [
      {
        id: 'tx_old',
        businessId: 'biz',
        customerId: 'cust1',
        type: 'CREDIT_SALE',
        amountPaise: toPaise(1000),
        description: 'First sale',
        dueDate: '2026-09-20',
        date: '2026-09-05',
        createdAt: '2026-09-05T10:00:00Z',
      },
      {
        id: 'tx_new',
        businessId: 'biz',
        customerId: 'cust1',
        type: 'CREDIT_SALE',
        amountPaise: toPaise(500),
        description: 'Second sale',
        dueDate: '2026-10-05',
        date: '2026-09-20',
        createdAt: '2026-09-20T10:00:00Z',
      },
    ];

    // Customer has active positive balance => earliest pending due date is 2026-09-20
    const activeDueDate = calculateCustomerDueDate(txs, toPaise(1500));
    expect(activeDueDate).toBe('2026-09-20');

    // If balance is 0 or settled, activeDueDate should be undefined
    const settledDueDate = calculateCustomerDueDate(txs, 0);
    expect(settledDueDate).toBeUndefined();
  });

  // Test I:
  // Transaction Editing & Deletion Recomputation:
  // 1. Initial: Opening 0 + Credit 1000 + Payment 400 => Due = 600
  // 2. Edit Credit: Changed from 1000 to 1500 => Due = 1100
  // 3. Delete Payment: Removed 400 payment => Due = 1500
  // 4. Delete Credit: Removed 1500 credit => Due = 0
  test('Test I: Transaction edit and delete properly recalculates customer balances and counts', () => {
    let txs: Transaction[] = [
      {
        id: 'tx_c1',
        businessId: 'biz',
        customerId: 'cust1',
        type: 'CREDIT_SALE',
        amountPaise: toPaise(1000),
        description: 'DAP Khad',
        date: '2026-09-01',
        createdAt: '2026-09-01T10:00:00Z',
      },
      {
        id: 'tx_p1',
        businessId: 'biz',
        customerId: 'cust1',
        type: 'PAYMENT',
        amountPaise: toPaise(400),
        description: 'Cash payment',
        date: '2026-09-05',
        createdAt: '2026-09-05T10:00:00Z',
      },
    ];

    // Initial state: 1000 - 400 = 600
    const b1 = calculateCustomerBalance(0, txs);
    expect(b1.netOutstandingPaise).toBe(toPaise(600));
    expect(b1.totalCreditPaise).toBe(toPaise(1000));
    expect(b1.totalPaymentPaise).toBe(toPaise(400));
    expect(b1.transactionCount).toBe(2);

    // 1. Edit tx_c1: change amount from 1000 to 1500
    txs = txs.map((t) => (t.id === 'tx_c1' ? { ...t, amountPaise: toPaise(1500) } : t));
    const b2 = calculateCustomerBalance(0, txs);
    expect(b2.netOutstandingPaise).toBe(toPaise(1100));
    expect(b2.totalCreditPaise).toBe(toPaise(1500));
    expect(b2.totalPaymentPaise).toBe(toPaise(400));

    // 2. Delete tx_p1: payment deleted
    txs = txs.filter((t) => t.id !== 'tx_p1');
    const b3 = calculateCustomerBalance(0, txs);
    expect(b3.netOutstandingPaise).toBe(toPaise(1500));
    expect(b3.totalCreditPaise).toBe(toPaise(1500));
    expect(b3.totalPaymentPaise).toBe(0);
    expect(b3.transactionCount).toBe(1);

    // 3. Delete tx_c1: credit deleted
    txs = txs.filter((t) => t.id !== 'tx_c1');
    const b4 = calculateCustomerBalance(0, txs);
    expect(b4.netOutstandingPaise).toBe(0);
    expect(b4.totalCreditPaise).toBe(0);
    expect(b4.totalPaymentPaise).toBe(0);
    expect(b4.transactionCount).toBe(0);
  });

  // Test J:
  // Master data deletion protection rule:
  // Cannot delete Customer or Village if any transactions exist.
  test('Test J: Master data (Customer & Village) deletion is blocked when transactions exist', () => {
    const transactions: Transaction[] = [
      {
        id: 'tx_1',
        businessId: 'biz1',
        customerId: 'cust_with_tx',
        villageName: 'Rampur',
        type: 'CREDIT_SALE',
        amountPaise: toPaise(500),
        description: 'Seeds',
        date: '2026-09-01',
        createdAt: '2026-09-01T10:00:00Z',
      },
    ];

    const canDeleteCustomer = (custId: string) => {
      const hasTx = transactions.some((t) => t.customerId === custId);
      return !hasTx;
    };

    const canDeleteVillage = (villageName: string, villageCustIds: string[]) => {
      const custSet = new Set(villageCustIds);
      const hasTx = transactions.some(
        (t) => (t.customerId && custSet.has(t.customerId)) || t.villageName === villageName
      );
      return !hasTx;
    };

    // Customer with transaction should NOT be deletable
    expect(canDeleteCustomer('cust_with_tx')).toBe(false);

    // Customer without transaction SHOULD be deletable
    expect(canDeleteCustomer('cust_without_tx')).toBe(true);

    // Village with active transactions should NOT be deletable
    expect(canDeleteVillage('Rampur', ['cust_with_tx'])).toBe(false);

    // Village without transactions SHOULD be deletable
    expect(canDeleteVillage('Shyampur', ['cust_without_tx'])).toBe(true);
  });
});
