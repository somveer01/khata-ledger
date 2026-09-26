import { Customer, Transaction, VillageSummary, DashboardMetrics, CurrencyPaise } from '../types';
import { isToday, getTodayIST, getDaysDiff } from '../utils/date';

/**
 * Calculates the net outstanding balance for a customer.
 * 
 * Formula:
 * Outstanding Balance = Opening Balance + Credit Sales - Payments Received + Adjustments
 * 
 * All arithmetic is performed in integer paise.
 */
export function calculateCustomerBalance(
  openingBalancePaise: CurrencyPaise,
  transactions: Transaction[]
): {
  totalCreditPaise: CurrencyPaise;
  totalPaymentPaise: CurrencyPaise;
  netOutstandingPaise: CurrencyPaise;
  transactionCount: number;
} {
  let totalCredit = 0;
  let totalPayment = 0;
  let netAdjustments = 0;
  let count = 0;

  for (const tx of transactions) {
    if (tx.isReversed) continue; // Exclude reversed transactions from totals
    count++;

    switch (tx.type) {
      case 'CREDIT_SALE':
        totalCredit += Math.round(tx.amountPaise);
        break;
      case 'PAYMENT':
        totalPayment += Math.round(tx.amountPaise);
        netAdjustments -= Math.round(tx.discountPaise || 0);
        break;
      case 'ADJUSTMENT':
        netAdjustments += Math.round(tx.amountPaise);
        break;
      case 'REVERSAL':
        // If logged as an explicit reversal transaction
        // (usually negative or offsets original)
        netAdjustments -= Math.round(tx.amountPaise);
        break;
      default:
        break;
    }
  }

  const netOutstanding = Math.round(openingBalancePaise) + totalCredit - totalPayment + netAdjustments;

  return {
    totalCreditPaise: totalCredit,
    totalPaymentPaise: totalPayment,
    netOutstandingPaise: netOutstanding,
    transactionCount: count,
  };
}

/**
 * Computes running balances for a sorted list of transactions.
 * Sorts chronologically (earliest to latest), applies opening balance,
 * and sets runningBalancePaise for each row (matching paper ledger).
 */
export function computeLedgerWithRunningBalances(
  openingBalancePaise: CurrencyPaise,
  transactions: Transaction[]
): Transaction[] {
  // Sort ascending by date, then createdAt
  const sorted = [...transactions].sort((a, b) => {
    const dateComp = (a.date || '').localeCompare(b.date || '');
    if (dateComp !== 0) return dateComp;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });

  let running = Math.round(openingBalancePaise);

  return sorted.map((tx) => {
    if (tx.isReversed) {
      return { ...tx, runningBalancePaise: running };
    }

    if (tx.type === 'CREDIT_SALE') {
      running += Math.round(tx.amountPaise);
    } else if (tx.type === 'PAYMENT') {
      running -= Math.round(tx.amountPaise + (tx.discountPaise || 0));
    } else if (tx.type === 'ADJUSTMENT') {
      running += Math.round(tx.amountPaise);
    } else if (tx.type === 'REVERSAL') {
      running -= Math.round(tx.amountPaise);
    }

    return {
      ...tx,
      runningBalancePaise: running,
    };
  });
}

/**
 * Reconciles customer dues by village.
 * Aggregates all customers belonging to each village.
 */
export function calculateVillageSummaries(
  villages: { id: string; name: string }[],
  customers: Customer[]
): VillageSummary[] {
  const map = new Map<string, VillageSummary>();

  for (const v of villages) {
    map.set(v.id, {
      villageId: v.id,
      villageName: v.name,
      customerCount: 0,
      customersWithDueCount: 0,
      totalCreditPaise: 0,
      totalPaymentPaise: 0,
      totalOutstandingPaise: 0,
    });
  }

  for (const c of customers) {
    if (c.status === 'INACTIVE') continue;

    let vSummary = map.get(c.villageId);
    if (!vSummary) {
      vSummary = {
        villageId: c.villageId || 'other',
        villageName: c.villageName || 'Other',
        customerCount: 0,
        customersWithDueCount: 0,
        totalCreditPaise: 0,
        totalPaymentPaise: 0,
        totalOutstandingPaise: 0,
      };
      map.set(c.villageId || 'other', vSummary);
    }

    vSummary.customerCount += 1;
    vSummary.totalCreditPaise += c.totalCreditPaise || 0;
    vSummary.totalPaymentPaise += c.totalPaymentPaise || 0;
    vSummary.totalOutstandingPaise += c.currentBalancePaise || 0;

    if ((c.currentBalancePaise || 0) > 0) {
      vSummary.customersWithDueCount += 1;
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalOutstandingPaise - a.totalOutstandingPaise);
}

/**
 * Computes dashboard KPI metrics from customers and transactions.
 */
export function calculateDashboardMetrics(
  customers: Customer[],
  transactions: Transaction[],
  villageCount: number
): DashboardMetrics {
  let totalOutstanding = 0;
  let customersWithDue = 0;
  let activeCustomers = 0;

  for (const c of customers) {
    if (c.status === 'INACTIVE') continue;
    activeCustomers++;
    const bal = c.currentBalancePaise || 0;
    totalOutstanding += bal;
    if (bal > 0) {
      customersWithDue++;
    }
  }

  let todayCreditSales = 0;
  let todayPayments = 0;
  let monthCreditSales = 0;
  let monthPayments = 0;

  const currentYearMonth = new Date().toISOString().substring(0, 7); // YYYY-MM

  for (const tx of transactions) {
    if (tx.isReversed) continue;

    const txDate = tx.date || '';
    const isTxToday = isToday(txDate);
    const isThisMonth = txDate.startsWith(currentYearMonth);

    if (tx.type === 'CREDIT_SALE') {
      if (isTxToday) todayCreditSales += tx.amountPaise;
      if (isThisMonth) monthCreditSales += tx.amountPaise;
    } else if (tx.type === 'PAYMENT') {
      if (isTxToday) todayPayments += tx.amountPaise;
      if (isThisMonth) monthPayments += tx.amountPaise;
    }
  }

  return {
    totalOutstandingPaise: totalOutstanding,
    todayCreditSalesPaise: todayCreditSales,
    todayPaymentsReceivedPaise: todayPayments,
    totalCustomers: activeCustomers,
    customersWithDueCount: customersWithDue,
    totalVillages: villageCount,
    thisMonthCreditSalesPaise: monthCreditSales,
    thisMonthPaymentsPaise: monthPayments,
  };
}

export type DueStatusType = 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | 'NONE';

export interface DueStatusInfo {
  status: DueStatusType;
  daysDiff: number; // positive = overdue by N days; negative = upcoming in N days; 0 = today
  labelKey: 'daysOverdue' | 'dueToday' | 'upcomingDue' | 'noDueDateSet';
}

/**
 * Evaluates whether a payment due date is Overdue, Due Today, or Upcoming relative to reference date.
 */
export function getDueStatus(dueDate: string | undefined, referenceDate: string = getTodayIST()): DueStatusInfo {
  if (!dueDate) {
    return { status: 'NONE', daysDiff: 0, labelKey: 'noDueDateSet' };
  }
  const cleanDue = dueDate.substring(0, 10);
  const cleanRef = referenceDate.substring(0, 10);
  const diffDays = getDaysDiff(cleanDue, cleanRef);

  if (diffDays > 0) {
    return { status: 'OVERDUE', daysDiff: diffDays, labelKey: 'daysOverdue' };
  } else if (diffDays === 0) {
    return { status: 'DUE_TODAY', daysDiff: 0, labelKey: 'dueToday' };
  } else {
    return { status: 'UPCOMING', daysDiff: Math.abs(diffDays), labelKey: 'upcomingDue' };
  }
}

/**
 * Computes active payment due date for a customer from unreversed credit transactions.
 * Returns earliest pending due date if customer has an outstanding balance.
 */
export function calculateCustomerDueDate(
  transactions: Transaction[],
  currentBalancePaise: number
): string | undefined {
  if (currentBalancePaise <= 0) return undefined;

  const creditTxsWithDueDate = transactions
    .filter((tx) => !tx.isReversed && tx.type === 'CREDIT_SALE' && Boolean(tx.dueDate))
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

  if (creditTxsWithDueDate.length === 0) return undefined;
  return creditTxsWithDueDate[0].dueDate;
}
