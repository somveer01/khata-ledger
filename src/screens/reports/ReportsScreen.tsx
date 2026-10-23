import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { t } from '../../i18n';
import { formatCurrency, toRupees, amountInWords } from '../../utils/money';
import { getTodayIST, formatUpperDate, formatDisplayDate } from '../../utils/date';
import { DataRepository } from '../../services/db';
import { PdfService } from '../../services/pdfService';
import { ReminderService } from '../../services/reminderService';
import { callPhoneNumber } from '../../utils/contacts';
import { calculateCustomerDueDate, getDueStatus } from '../../services/accounting';
import { Customer, Transaction, VillageSummary } from '../../types';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

const daysOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const ReportsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { business, language, dataVersion } = useApp();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [villages, setVillages] = useState<VillageSummary[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportingDateRange, setExportingDateRange] = useState(false);

  // Active Report Tab: 'DUE_REPORT' | 'TRANSACTIONS' | 'VILLAGE_REPORT'
  type ReportTab = 'DUE_REPORT' | 'TRANSACTIONS' | 'VILLAGE_REPORT';
  const [selectedReport, setSelectedReport] = useState<ReportTab>('DUE_REPORT');
  const [expandedVillages, setExpandedVillages] = useState<Record<string, boolean>>({});

  // Date Filter State (defaults to Today: e.g. '2026-09-23')
  const todayStr = getTodayIST();
  const [fromDate, setFromDate] = useState<string>(todayStr);
  const [toDate, setToDate] = useState<string>(todayStr);

  // Calendar Modal State
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [targetDateField, setTargetDateField] = useState<'FROM' | 'TO'>('FROM');
  const [viewYear, setViewYear] = useState<number>(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(new Date().getMonth());

  // Customer-wise Date Bill States
  const [txViewMode, setTxViewMode] = useState<'BY_CUSTOMER' | 'ALL_ENTRIES'>('BY_CUSTOMER');
  const [selectedCustBill, setSelectedCustBill] = useState<{
    customer: Customer;
    txs: Transaction[];
    creditTotal: number;
    paymentTotal: number;
    previousBalancePaise: number;
    finalClosingDuePaise: number;
  } | null>(null);
  const [exportingCustomerPdfId, setExportingCustomerPdfId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!business) return;
    const [c, tx, v] = await Promise.all([
      DataRepository.getCustomers(business.id),
      DataRepository.getTransactions(business.id),
      DataRepository.getVillageSummaries(business.id, true),
    ]);
    setCustomers(c);
    setTransactions(tx);
    setVillages(v);
  }, [business]);

  useEffect(() => {
    loadData();
  }, [loadData, dataVersion]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  const periodStats = useMemo(() => {
    const filtered = transactions
      .filter((tx) => !tx.isReversed)
      .filter((tx) => {
        const txD = tx.date.substring(0, 10);
        return txD >= fromDate && txD <= toDate;
      });

    let creditTotal = 0;
    let paymentTotal = 0;

    for (const tx of filtered) {
      if (tx.type === 'CREDIT_SALE') {
        creditTotal += tx.amountPaise;
      } else if (tx.type === 'PAYMENT') {
        paymentTotal += tx.amountPaise;
      }
    }

    const sorted = [...filtered].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));

    return {
      txCount: sorted.length,
      creditTotal,
      paymentTotal,
      netDiff: creditTotal - paymentTotal,
      filteredTxs: sorted,
    };
  }, [transactions, fromDate, toDate]);

  // Group period transactions by customer with their individual previous balance & closing balance
  const customerPeriodBreakdown = useMemo(() => {
    const custMap = new Map<string, {
      customer: Customer;
      txs: Transaction[];
      creditTotal: number;
      paymentTotal: number;
      previousBalancePaise: number;
      finalClosingDuePaise: number;
    }>();

    for (const tx of periodStats.filteredTxs) {
      const cust = customerMap.get(tx.customerId);
      if (!cust) continue;

      if (!custMap.has(tx.customerId)) {
        // Calculate this customer's previous balance before fromDate
        const prevTxs = transactions.filter(
          (t) => t.customerId === cust.id && !t.isReversed && t.date.substring(0, 10) < fromDate
        );
        const netPrevTxs = prevTxs.reduce((sum, t) => {
          if (t.type === 'CREDIT_SALE') return sum + t.amountPaise;
          if (t.type === 'PAYMENT') return sum - t.amountPaise;
          return sum;
        }, 0);
        const prevBal = Math.max(0, (cust.openingBalancePaise || 0) + netPrevTxs);

        custMap.set(tx.customerId, {
          customer: cust,
          txs: [],
          creditTotal: 0,
          paymentTotal: 0,
          previousBalancePaise: prevBal,
          finalClosingDuePaise: prevBal,
        });
      }

      const entry = custMap.get(tx.customerId)!;
      entry.txs.push(tx);
      if (tx.type === 'CREDIT_SALE') entry.creditTotal += tx.amountPaise;
      else if (tx.type === 'PAYMENT') entry.paymentTotal += tx.amountPaise;
      entry.finalClosingDuePaise = entry.previousBalancePaise + (entry.creditTotal - entry.paymentTotal);
    }

    return Array.from(custMap.values()).sort((a, b) => b.creditTotal - a.creditTotal);
  }, [periodStats.filteredTxs, customerMap, transactions, fromDate]);

  type DueFilterMode = 'ALL' | 'OVERDUE' | 'IN_PERIOD' | 'TODAY';
  const [dueFilter, setDueFilter] = useState<DueFilterMode>('ALL');
  const [exportingDueReport, setExportingDueReport] = useState(false);

  const customerWithDueDate = useMemo(() => {
    return customers.map((c) => {
      if (c.dueDate) return c;
      const custTxs = transactions.filter((tx) => tx.customerId === c.id);
      const computedDue = calculateCustomerDueDate(custTxs, c.currentBalancePaise || 0);
      return { ...c, dueDate: computedDue };
    });
  }, [customers, transactions]);

  const dueReportData = useMemo(() => {
    const list = customerWithDueDate.filter(
      (c) => (c.currentBalancePaise || 0) > 0 && c.status !== 'INACTIVE'
    );

    let overdueTotal = 0;
    let inPeriodTotal = 0;
    let todayTotal = 0;
    let grandTotal = 0;

    const evaluated = list.map((c) => {
      const info = getDueStatus(c.dueDate, todayStr);
      grandTotal += c.currentBalancePaise;
      if (info.status === 'OVERDUE') overdueTotal += c.currentBalancePaise;
      if (info.status === 'DUE_TODAY') todayTotal += c.currentBalancePaise;
      if (c.dueDate && c.dueDate >= fromDate && c.dueDate <= toDate) {
        inPeriodTotal += c.currentBalancePaise;
      }
      return { customer: c, dueInfo: info };
    });

    let filtered = evaluated;
    if (dueFilter === 'OVERDUE') {
      filtered = evaluated.filter((item) => item.dueInfo.status === 'OVERDUE');
    } else if (dueFilter === 'IN_PERIOD') {
      filtered = evaluated.filter(
        (item) => item.customer.dueDate && item.customer.dueDate >= fromDate && item.customer.dueDate <= toDate
      );
    } else if (dueFilter === 'TODAY') {
      filtered = evaluated.filter((item) => item.dueInfo.status === 'DUE_TODAY');
    }

    filtered.sort((a, b) => {
      if (a.dueInfo.status === 'OVERDUE' && b.dueInfo.status !== 'OVERDUE') return -1;
      if (b.dueInfo.status === 'OVERDUE' && a.dueInfo.status !== 'OVERDUE') return 1;
      return (b.customer.currentBalancePaise || 0) - (a.customer.currentBalancePaise || 0);
    });

    return {
      allDueCustomers: evaluated,
      filteredCustomers: filtered,
      overdueTotalPaise: overdueTotal,
      inPeriodTotalPaise: inPeriodTotal,
      todayTotalPaise: todayTotal,
      grandTotalPaise: grandTotal,
    };
  }, [customerWithDueDate, todayStr, fromDate, toDate, dueFilter]);

  const totalOutstandingAll = customers.reduce(
    (acc, c) => acc + (c.currentBalancePaise || 0),
    0
  );

  const handleExportDuePdf = async () => {
    if (!business || exportingDueReport) return;
    setExportingDueReport(true);
    try {
      const title =
        dueFilter === 'OVERDUE'
          ? (language === 'hi' ? 'अतिदेय ग्राहक सूची (Overdue Report)' : 'Overdue Customers Report')
          : dueFilter === 'IN_PERIOD'
          ? (language === 'hi' ? `अवधि में देय रिपोर्ट (${formatUpperDate(fromDate)} - ${formatUpperDate(toDate)})` : `Dues in Date Range (${formatUpperDate(fromDate)} - ${formatUpperDate(toDate)})`)
          : (language === 'hi' ? 'समस्त बकाया ग्राहक रिपोर्ट (Pending Dues Report)' : 'All Pending Dues Report');

      const total = dueReportData.filteredCustomers.reduce(
        (sum, item) => sum + (item.customer.currentBalancePaise || 0),
        0
      );

      const uri = await PdfService.generateDueReportPdf(
        business,
        dueReportData.filteredCustomers,
        title,
        total
      );
      await PdfService.sharePdf(uri, undefined, title);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (
        !msg.includes('canceled') &&
        !msg.includes('cancelled') &&
        !msg.includes('rejected') &&
        !msg.includes('dismissed')
      ) {
        Alert.alert(t('error', language), msg);
      }
    } finally {
      setTimeout(() => setExportingDueReport(false), 700);
    }
  };

  const handleSendReminder = async (cust: Customer) => {
    if (!business) return;
    const msg = ReminderService.generateReminderMessage(business, cust, language);
    await ReminderService.sendViaWhatsApp(cust.mobile, msg);
  };

  const handleExportVillagePdf = async () => {
    if (!business || exporting) return;
    setExporting(true);
    try {
      const uri = await PdfService.generateVillageReportPdf(
        business,
        villages,
        totalOutstandingAll
      );
      await PdfService.sharePdf(uri, undefined, 'Village Summary Report');
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (
        !msg.includes('canceled') &&
        !msg.includes('cancelled') &&
        !msg.includes('rejected') &&
        !msg.includes('dismissed')
      ) {
        Alert.alert(t('error', language), msg);
      }
    } finally {
      setTimeout(() => setExporting(false), 700);
    }
  };

  const handleExportDateRangePdf = async () => {
    if (!business || exportingDateRange) return;
    setExportingDateRange(true);
    try {
      const txWithDetails = periodStats.filteredTxs.map((tx) => ({
        ...tx,
        customerName: customerMap.get(tx.customerId)?.name || 'Customer',
        villageName: customerMap.get(tx.customerId)?.villageName,
      }));

      // Calculate previous balance: opening balance of all customers + net transactions before fromDate
      const totalOpeningBalancePaise = customers.reduce(
        (sum, c) => sum + (c.openingBalancePaise || 0),
        0
      );

      const netTxsBeforeDatePaise = transactions
        .filter((tx) => !tx.isReversed && tx.date.substring(0, 10) < fromDate)
        .reduce((sum, tx) => {
          if (tx.type === 'CREDIT_SALE') return sum + tx.amountPaise;
          if (tx.type === 'PAYMENT') return sum - tx.amountPaise;
          return sum;
        }, 0);

      const previousBalancePaise = Math.max(0, totalOpeningBalancePaise + netTxsBeforeDatePaise);

      const uri = await PdfService.generateDateRangeReportPdf(
        business,
        fromDate,
        toDate,
        txWithDetails,
        periodStats.creditTotal,
        periodStats.paymentTotal,
        Math.max(0, previousBalancePaise)
      );
      await PdfService.sharePdf(uri, undefined, `Transactions_${fromDate}_to_${toDate}`);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (
        !msg.includes('canceled') &&
        !msg.includes('cancelled') &&
        !msg.includes('rejected') &&
        !msg.includes('dismissed')
      ) {
        Alert.alert(t('error', language), msg);
      }
    } finally {
      setTimeout(() => setExportingDateRange(false), 700);
    }
  };

  const handleShareDateRangeWhatsApp = async () => {
    if (!business) return;

    const totalOpeningBalancePaise = customers.reduce(
      (sum, c) => sum + (c.openingBalancePaise || 0),
      0
    );

    const netTxsBeforeDatePaise = transactions
      .filter((tx) => !tx.isReversed && tx.date.substring(0, 10) < fromDate)
      .reduce((sum, tx) => {
        if (tx.type === 'CREDIT_SALE') return sum + tx.amountPaise;
        if (tx.type === 'PAYMENT') return sum - tx.amountPaise;
        return sum;
      }, 0);

    const previousBalancePaise = Math.max(0, totalOpeningBalancePaise + netTxsBeforeDatePaise);
    const finalClosingDuePaise = previousBalancePaise + (periodStats.creditTotal - periodStats.paymentTotal);

    const periodStr =
      fromDate === toDate
        ? formatUpperDate(fromDate)
        : `${formatUpperDate(fromDate)} से ${formatUpperDate(toDate)}`;

    // Build itemized list of all transactions in this selected date/period
    const entriesList = periodStats.filteredTxs.map((tx, idx) => {
      const cust = customerMap.get(tx.customerId);
      const isSale = tx.type === 'CREDIT_SALE';
      const typeTag = isSale ? '🔴 उधार (+)' : '🟢 जमा (-)';
      const custName = cust?.name ? `*${cust.name}*${cust.villageName ? ` (${cust.villageName})` : ''}` : 'ग्राहक';
      const descPart = tx.description ? `\n   विवरण: ${tx.description}` : '';
      const qtyPart = tx.quantity ? ` [मात्रा: ${tx.quantity} ${tx.unit || ''}${tx.ratePaise ? ` @ ₹${toRupees(tx.ratePaise)}` : ''}]` : '';

      return `${idx + 1}. ${custName} ➔ *${formatCurrency(tx.amountPaise)}* ${typeTag}${descPart}${qtyPart}`;
    }).join('\n\n');

    const entriesSection = entriesList
      ? (language === 'hi'
          ? `*📝 इस अवधि का लेनदेन विवरण (${periodStats.filteredTxs.length}):*\n\n${entriesList}\n`
          : `*📝 Transactions in Period (${periodStats.filteredTxs.length}):*\n\n${entriesList}\n`)
      : (language === 'hi'
          ? `*(इस अवधि में कोई लेनदेन प्रविष्टि नहीं)*\n`
          : `*(No transactions in this period)*\n`);

    const message =
      language === 'hi'
        ? `*${business.name}* 🏪\n` +
          `*दैनिक खाता बही व लेनदेन रिपोर्ट* 📋\n\n` +
          `📅 अवधि: *${periodStr}*\n` +
          `─────────────────────\n` +
          `🟣 *1. पिछला बकाया:* *${formatCurrency(previousBalancePaise)}*\n` +
          `─────────────────────\n` +
          entriesSection +
          `─────────────────────\n` +
          `➕ कुल नया उधार: *+ ${formatCurrency(periodStats.creditTotal)}*\n` +
          `➖ कुल प्राप्त जमा: *- ${formatCurrency(periodStats.paymentTotal)}*\n` +
          `═════════════════════\n` +
          `⭐ *कुल अंतिम बकाया: ${formatCurrency(finalClosingDuePaise)}*\n` +
          `_अक्षरों में: ${amountInWords(finalClosingDuePaise)}_\n` +
          (business.upiId ? `\n💳 UPI भुगतान लिंक: ${business.upiId}\n` : '') +
          `\n📞 संपर्क: ${business.phone}\nडिजिटल खाता बही • धन्यवाद! 🙏`
        : `*${business.name}* 🏪\n` +
          `*Daily Ledger & Transactions Report* 📋\n\n` +
          `📅 Period: *${periodStr}*\n` +
          `─────────────────────\n` +
          `🟣 *1. Previous Due:* *${formatCurrency(previousBalancePaise)}*\n` +
          `─────────────────────\n` +
          entriesSection +
          `─────────────────────\n` +
          `➕ Total New Udhaar (+): *+ ${formatCurrency(periodStats.creditTotal)}*\n` +
          `➖ Total Received Jama (-): *- ${formatCurrency(periodStats.paymentTotal)}*\n` +
          `═════════════════════\n` +
          `⭐ *Net Closing Due: ${formatCurrency(finalClosingDuePaise)}*\n` +
          `_In Words: ${amountInWords(finalClosingDuePaise)}_\n` +
          (business.upiId ? `\n💳 UPI Payment: ${business.upiId}\n` : '') +
          `\n📞 Contact: ${business.phone}\nThank you! 🙏`;

    await ReminderService.shareToWhatsApp(message);
  };

  const handleShareCustomerWhatsApp = async (item: {
    customer: Customer;
    txs: Transaction[];
    previousBalancePaise: number;
  }) => {
    if (!business) return;
    const msg = ReminderService.generateCustomerDateBillMessage(
      business,
      item.customer,
      fromDate,
      toDate,
      item.txs,
      item.previousBalancePaise,
      language
    );

    if (item.customer.mobile) {
      await ReminderService.sendViaWhatsApp(item.customer.mobile, msg);
    } else {
      await ReminderService.shareToWhatsApp(msg);
    }
  };

  const handleExportCustomerPdf = async (item: {
    customer: Customer;
    txs: Transaction[];
    creditTotal: number;
    paymentTotal: number;
    previousBalancePaise: number;
  }) => {
    if (!business || exportingCustomerPdfId) return;
    setExportingCustomerPdfId(item.customer.id);
    try {
      const uri = await PdfService.generateCustomerDateBillPdf(
        business,
        item.customer,
        fromDate,
        toDate,
        item.txs,
        item.creditTotal,
        item.paymentTotal,
        item.previousBalancePaise
      );
      await PdfService.sharePdf(uri, undefined, `${item.customer.name}_Bill_${fromDate}`);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (
        !msg.includes('canceled') &&
        !msg.includes('cancelled') &&
        !msg.includes('rejected') &&
        !msg.includes('dismissed')
      ) {
        Alert.alert(t('error', language), msg);
      }
    } finally {
      setTimeout(() => setExportingCustomerPdfId(null), 700);
    }
  };

  // Date Preset Handlers
  const applyPreset = (preset: 'TODAY' | 'YESTERDAY' | 'LAST7' | 'THIS_MONTH' | 'LAST_MONTH') => {
    const now = new Date();
    if (preset === 'TODAY') {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (preset === 'YESTERDAY') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const yStr = format(d, 'yyyy-MM-dd');
      setFromDate(yStr);
      setToDate(yStr);
    } else if (preset === 'LAST7') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      const sStr = format(d, 'yyyy-MM-dd');
      setFromDate(sStr);
      setToDate(todayStr);
    } else if (preset === 'THIS_MONTH') {
      const firstOfMonth = todayStr.substring(0, 7) + '-01';
      setFromDate(firstOfMonth);
      setToDate(todayStr);
    } else if (preset === 'LAST_MONTH') {
      const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setFromDate(format(firstOfLastMonth, 'yyyy-MM-dd'));
      setToDate(format(lastOfLastMonth, 'yyyy-MM-dd'));
    }
  };

  const openDatePicker = (field: 'FROM' | 'TO') => {
    setTargetDateField(field);
    const currentDate = field === 'FROM' ? fromDate : toDate;
    try {
      const parts = currentDate.split('-');
      if (parts.length === 3) {
        setViewYear(parseInt(parts[0], 10));
        setViewMonth(parseInt(parts[1], 10) - 1);
      }
    } catch {
      // fallback
    }
    setCalendarModalVisible(true);
  };

  const selectDay = (day: number) => {
    const formatted = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (targetDateField === 'FROM') {
      setFromDate(formatted);
      if (formatted > toDate) {
        setToDate(formatted);
      }
    } else {
      setToDate(formatted);
      if (formatted < fromDate) {
        setFromDate(formatted);
      }
    }
    setCalendarModalVisible(false);
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d);
    }
    return days;
  }, [viewYear, viewMonth]);

  const activeCompareDate = targetDateField === 'FROM' ? fromDate : toDate;

  return (
    <View style={styles.screen}>
      <Header
        title={t('navReports', language)}
        subtitle={t('reportsSubtitle', language)}
        showBack
        onBack={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate('DashboardTab');
          }
        }}
      />

      {/* Top Segmented Report Switcher Bar */}
      <View style={styles.reportSelectorBar}>
        <TouchableOpacity
          style={[styles.reportSelectorTab, selectedReport === 'DUE_REPORT' && styles.activeReportSelectorTab]}
          onPress={() => setSelectedReport('DUE_REPORT')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="calendar"
            size={16}
            color={selectedReport === 'DUE_REPORT' ? Colors.primary : Colors.textSecondary}
          />
          <Text style={[styles.reportSelectorText, selectedReport === 'DUE_REPORT' && styles.activeReportSelectorText]}>
            {t('reportTabDue', language)}
          </Text>
          {dueReportData.allDueCustomers.length > 0 && (
            <View style={[styles.tabBadge, selectedReport === 'DUE_REPORT' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, selectedReport === 'DUE_REPORT' && styles.tabBadgeTextActive]}>
                {dueReportData.allDueCustomers.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.reportSelectorTab, selectedReport === 'TRANSACTIONS' && styles.activeReportSelectorTab]}
          onPress={() => setSelectedReport('TRANSACTIONS')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="receipt-outline"
            size={16}
            color={selectedReport === 'TRANSACTIONS' ? Colors.primary : Colors.textSecondary}
          />
          <Text style={[styles.reportSelectorText, selectedReport === 'TRANSACTIONS' && styles.activeReportSelectorText]}>
            {t('reportTabTransactions', language)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.reportSelectorTab, selectedReport === 'VILLAGE_REPORT' && styles.activeReportSelectorTab]}
          onPress={() => setSelectedReport('VILLAGE_REPORT')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="business-outline"
            size={16}
            color={selectedReport === 'VILLAGE_REPORT' ? Colors.primary : Colors.textSecondary}
          />
          <Text style={[styles.reportSelectorText, selectedReport === 'VILLAGE_REPORT' && styles.activeReportSelectorText]}>
            {t('reportTabVillages', language)}
          </Text>
          {villages.length > 0 && (
            <View style={[styles.tabBadge, selectedReport === 'VILLAGE_REPORT' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, selectedReport === 'VILLAGE_REPORT' && styles.tabBadgeTextActive]}>
                {villages.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ========================================================================= */}
        {/* REPORT 1: DUE DATE & OVERDUE REPORT */}
        {/* ========================================================================= */}
        {selectedReport === 'DUE_REPORT' && (
          <View style={styles.overdueSection}>
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>
                  {t('duesByDueDateReport', language)}
                </Text>
                <Text style={styles.sectionSubtitle}>
                  {dueReportData.filteredCustomers.length} {t('customersCountLabel', language)} • {t('totalOutstanding', language)}: {formatCurrency(dueReportData.filteredCustomers.reduce((s, i) => s + i.customer.currentBalancePaise, 0))}
                </Text>
              </View>
              <Button
                title={t('pdfShareBtn', language)}
                onPress={handleExportDuePdf}
                loading={exportingDueReport}
                size="sm"
                variant="outline"
                icon={<Ionicons name="document-text-outline" size={14} color={Colors.primary} />}
              />
            </View>

            {/* Dues Summary Metric Boxes */}
            <View style={styles.duesMetricsRow}>
              {/* Box 1: Overdue */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.dueMetricCard, dueFilter === 'OVERDUE' && styles.activeDueMetricCard]}
                onPress={() => setDueFilter(dueFilter === 'OVERDUE' ? 'ALL' : 'OVERDUE')}
              >
                <Text style={styles.dueMetricLabel}>{t('totalOverdueAmount', language)}</Text>
                <Text style={[styles.dueMetricValue, { color: Colors.creditSale }]}>
                  {formatCurrency(dueReportData.overdueTotalPaise)}
                </Text>
                <Text style={styles.dueMetricCount}>
                  {dueReportData.allDueCustomers.filter((i) => i.dueInfo.status === 'OVERDUE').length} {language === 'hi' ? 'ग्राहक लेट' : 'late'}
                </Text>
              </TouchableOpacity>

              {/* Box 2: In Period */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.dueMetricCard, dueFilter === 'IN_PERIOD' && styles.activeDueMetricCard]}
                onPress={() => setDueFilter(dueFilter === 'IN_PERIOD' ? 'ALL' : 'IN_PERIOD')}
              >
                <Text style={styles.dueMetricLabel}>{t('duesInPeriod', language)}</Text>
                <Text style={[styles.dueMetricValue, { color: Colors.primary }]}>
                  {formatCurrency(dueReportData.inPeriodTotalPaise)}
                </Text>
                <Text style={styles.dueMetricCount}>
                  {dueReportData.allDueCustomers.filter((i) => i.customer.dueDate && i.customer.dueDate >= fromDate && i.customer.dueDate <= toDate).length} {language === 'hi' ? 'अवधि में देय' : 'in range'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Filter Chips: All, Overdue, In Period, Today */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dueFilterChipsScroll}>
              <TouchableOpacity
                style={[styles.dueFilterChip, dueFilter === 'ALL' && styles.activeDueFilterChip]}
                onPress={() => setDueFilter('ALL')}
              >
                <Text style={[styles.dueFilterChipText, dueFilter === 'ALL' && styles.activeDueFilterChipText]}>
                  {t('allPendingDues', language)} ({dueReportData.allDueCustomers.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dueFilterChip, dueFilter === 'OVERDUE' && styles.activeDueFilterChipDanger]}
                onPress={() => setDueFilter('OVERDUE')}
              >
                <Text style={[styles.dueFilterChipText, dueFilter === 'OVERDUE' && styles.activeDueFilterChipDangerText]}>
                  🔴 {t('overdueOnly', language)} ({dueReportData.allDueCustomers.filter((i) => i.dueInfo.status === 'OVERDUE').length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dueFilterChip, dueFilter === 'IN_PERIOD' && styles.activeDueFilterChip]}
                onPress={() => setDueFilter('IN_PERIOD')}
              >
                <Text style={[styles.dueFilterChipText, dueFilter === 'IN_PERIOD' && styles.activeDueFilterChipText]}>
                  📅 {t('duesInPeriod', language)} ({dueReportData.allDueCustomers.filter((i) => i.customer.dueDate && i.customer.dueDate >= fromDate && i.customer.dueDate <= toDate).length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dueFilterChip, dueFilter === 'TODAY' && styles.activeDueFilterChipWarning]}
                onPress={() => setDueFilter('TODAY')}
              >
                <Text style={[styles.dueFilterChipText, dueFilter === 'TODAY' && styles.activeDueFilterChipWarningText]}>
                  🟡 {t('dueToday', language)} ({dueReportData.allDueCustomers.filter((i) => i.dueInfo.status === 'DUE_TODAY').length})
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Due Customers List */}
            {dueReportData.filteredCustomers.length === 0 ? (
              <Card style={styles.emptyDueCard}>
                <Ionicons name="checkmark-circle-outline" size={36} color={Colors.paymentReceived} />
                <Text style={styles.emptyDueText}>
                  {language === 'hi' ? 'इस श्रेणी में कोई देय बकाया नहीं है।' : 'No pending dues found in this category.'}
                </Text>
              </Card>
            ) : (
              dueReportData.filteredCustomers.map(({ customer: cust, dueInfo }) => {
                const isOverdue = dueInfo.status === 'OVERDUE';
                const isTodayDue = dueInfo.status === 'DUE_TODAY';
                const isUpcoming = dueInfo.status === 'UPCOMING';

                return (
                  <TouchableOpacity
                    key={cust.id}
                    activeOpacity={0.8}
                    style={[styles.overdueItem, isOverdue && styles.overdueItemAlert]}
                    onPress={() => navigation.navigate('CustomerLedger', { customer: cust })}
                  >
                    <View style={[styles.avatar, isOverdue && styles.avatarOverdue]}>
                      <Text style={[styles.avatarText, isOverdue && { color: Colors.creditSale }]}>
                        {cust.name.charAt(0)}
                      </Text>
                    </View>

                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.custName}>{cust.name}</Text>
                      <Text style={styles.custSub}>
                        {cust.villageName || t('noVillageRecorded', language)}
                      </Text>

                      {/* Due Date & Dynamic Status Badge */}
                      <View style={styles.custDueDateRow}>
                        <View style={styles.dueDateBadgePill}>
                          <Ionicons name="calendar-outline" size={11} color={Colors.textSecondary} />
                          <Text style={styles.dueDateBadgePillText}>
                            {cust.dueDate ? formatUpperDate(cust.dueDate) : t('noDueDateSet', language)}
                          </Text>
                        </View>

                        {isOverdue && (
                          <View style={styles.statusBadgeOverdue}>
                            <Text style={styles.statusBadgeOverdueText}>
                              {dueInfo.daysDiff} {t('daysOverdue', language)}
                            </Text>
                          </View>
                        )}
                        {isTodayDue && (
                          <View style={styles.statusBadgeToday}>
                            <Text style={styles.statusBadgeTodayText}>{t('dueToday', language)}</Text>
                          </View>
                        )}
                        {isUpcoming && (
                          <View style={styles.statusBadgeUpcoming}>
                            <Text style={styles.statusBadgeUpcomingText}>
                              {t('upcomingDue', language)} ({dueInfo.daysDiff}d)
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                      <Text style={styles.dueAmount}>{formatCurrency(cust.currentBalancePaise)}</Text>
                      <View style={styles.reportActionsRow}>
                        {cust.mobile ? (
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={styles.callReminderBtn}
                            onPress={(e) => {
                              e.stopPropagation();
                              callPhoneNumber(cust.mobile, cust.name);
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel={`${t('callCustomer', language)}: ${cust.name}`}
                          >
                            <Ionicons name="call" size={13} color="#1D4ED8" />
                            <Text style={styles.callReminderText}>{t('callCustomer', language)}</Text>
                          </TouchableOpacity>
                        ) : null}

                        {cust.mobile ? (
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={styles.whatsappReminderBtn}
                            onPress={(e) => {
                              e.stopPropagation();
                              handleSendReminder(cust);
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="logo-whatsapp" size={14} color="#22C55E" />
                            <Text style={styles.whatsappReminderText}>{language === 'hi' ? 'तगादा' : 'Remind'}</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* REPORT 2: TRANSACTIONS DATE RANGE REPORT */}
        {/* ========================================================================= */}
        {selectedReport === 'TRANSACTIONS' && (
          <>
            {/* Date Range Filter Card */}
            <Card style={styles.customDateCard}>
              <View style={styles.customDateHeaderRow}>
                <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                <Text style={styles.customDateCardTitle}>{t('customRangeTitle', language)}</Text>
              </View>

              {/* From Date & To Date Selectors */}
              <View style={styles.datePickersRow}>
                {/* From Date Box */}
                <TouchableOpacity
                  style={styles.dateSelectorBox}
                  activeOpacity={0.8}
                  onPress={() => openDatePicker('FROM')}
                >
                  <Text style={styles.dateLabel}>{t('fromDate', language)}</Text>
                  <View style={styles.dateValueRow}>
                    <Ionicons name="calendar" size={16} color={Colors.primary} />
                    <Text style={styles.dateValueText}>{formatUpperDate(fromDate)}</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.dateArrowBox}>
                  <Ionicons name="arrow-forward" size={18} color={Colors.textSecondary} />
                </View>

                {/* To Date Box */}
                <TouchableOpacity
                  style={styles.dateSelectorBox}
                  activeOpacity={0.8}
                  onPress={() => openDatePicker('TO')}
                >
                  <Text style={styles.dateLabel}>{t('toDate', language)}</Text>
                  <View style={styles.dateValueRow}>
                    <Ionicons name="calendar" size={16} color={Colors.primary} />
                    <Text style={styles.dateValueText}>{formatUpperDate(toDate)}</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Quick Preset Filter Chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetChipsScroll}>
                <TouchableOpacity style={styles.presetChip} onPress={() => applyPreset('TODAY')}>
                  <Text style={styles.presetChipText}>{t('presetToday', language)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.presetChip} onPress={() => applyPreset('YESTERDAY')}>
                  <Text style={styles.presetChipText}>{t('presetYesterday', language)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.presetChip} onPress={() => applyPreset('LAST7')}>
                  <Text style={styles.presetChipText}>{t('presetLast7Days', language)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.presetChip} onPress={() => applyPreset('THIS_MONTH')}>
                  <Text style={styles.presetChipText}>{t('presetThisMonth', language)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.presetChip} onPress={() => applyPreset('LAST_MONTH')}>
                  <Text style={styles.presetChipText}>{t('presetLastMonth', language)}</Text>
                </TouchableOpacity>
              </ScrollView>
            </Card>

            {/* Transactions list in Selected Date Range with Customer-wise Toggle */}
            <Card style={styles.transactionsCard}>
              <View style={styles.txCardHeader}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.txCardTitle}>
                    {txViewMode === 'BY_CUSTOMER'
                      ? (language === 'hi'
                          ? `ग्राहक अनुसार बिल पर्ची (${customerPeriodBreakdown.length})`
                          : `Customer Bills (${customerPeriodBreakdown.length})`)
                      : (language === 'hi'
                          ? `सभी प्रविष्टियाँ (${periodStats.txCount})`
                          : `All Entries (${periodStats.txCount})`)}
                  </Text>
                  <Text style={{ fontSize: 10, color: Colors.textSecondary, marginTop: 1 }}>
                    {formatUpperDate(fromDate)} {fromDate !== toDate ? `— ${formatUpperDate(toDate)}` : ''}
                  </Text>
                </View>

                {/* View Mode Toggle (Customer-wise vs All Entries) */}
                <View style={styles.viewModeToggleRow}>
                  <TouchableOpacity
                    style={[styles.viewModeBtn, txViewMode === 'BY_CUSTOMER' && styles.viewModeBtnActive]}
                    onPress={() => setTxViewMode('BY_CUSTOMER')}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="people"
                      size={13}
                      color={txViewMode === 'BY_CUSTOMER' ? '#FFFFFF' : Colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.viewModeBtnText,
                        txViewMode === 'BY_CUSTOMER' && styles.viewModeBtnTextActive,
                      ]}
                    >
                      {language === 'hi' ? 'ग्राहक-वार' : 'Customers'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.viewModeBtn, txViewMode === 'ALL_ENTRIES' && styles.viewModeBtnActive]}
                    onPress={() => setTxViewMode('ALL_ENTRIES')}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="list"
                      size={13}
                      color={txViewMode === 'ALL_ENTRIES' ? '#FFFFFF' : Colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.viewModeBtnText,
                        txViewMode === 'ALL_ENTRIES' && styles.viewModeBtnTextActive,
                      ]}
                    >
                      {language === 'hi' ? 'प्रविष्टियाँ' : 'Entries'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {periodStats.filteredTxs.length === 0 ? (
                <View style={styles.emptyPeriodBox}>
                  <Ionicons name="document-text-outline" size={32} color={Colors.textSecondary} />
                  <Text style={styles.emptyPeriodText}>
                    {t('noTransactionsInPeriod', language)}
                  </Text>
                  <Text style={styles.emptyPeriodSub}>
                    {formatUpperDate(fromDate)} {fromDate !== toDate ? `— ${formatUpperDate(toDate)}` : ''}
                  </Text>
                </View>
              ) : txViewMode === 'BY_CUSTOMER' ? (
                /* Customer-Wise Grouped Bills */
                customerPeriodBreakdown.map((item) => {
                  const cust = item.customer;
                  const isExportingPdf = exportingCustomerPdfId === cust.id;
                  return (
                    <View key={cust.id} style={styles.custBillCard}>
                      {/* Customer Info Header */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.custBillCardHeader}
                        onPress={() => setSelectedCustBill(item)}
                      >
                        <View style={styles.custBillAvatar}>
                          <Text style={styles.custBillAvatarText}>{cust.name.charAt(0)}</Text>
                        </View>
                        <View style={{ flex: 1, paddingHorizontal: Spacing.sm }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.custBillName}>{cust.name}</Text>
                            <View style={styles.txCountBadge}>
                              <Text style={styles.txCountBadgeText}>
                                {item.txs.length} {language === 'hi' ? 'प्रविष्टि' : 'tx'}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.custBillSub}>
                            {cust.villageName || t('noVillageRecorded', language)}
                            {cust.mobile ? ` • ${cust.mobile}` : ''}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.previewIconBtn}
                          onPress={() => setSelectedCustBill(item)}
                        >
                          <Ionicons name="eye-outline" size={15} color={Colors.primary} />
                          <Text style={styles.previewIconBtnText}>
                            {language === 'hi' ? 'पर्ची देखें' : 'View'}
                          </Text>
                        </TouchableOpacity>
                      </TouchableOpacity>

                      {/* Accounting summary mini table */}
                      <View style={styles.custBillSummaryBox}>
                        <View style={styles.custBillSummaryRow}>
                          <Text style={styles.custBillSummaryLabel}>
                            🟣 {language === 'hi' ? '1. पिछला बकाया:' : '1. Previous Due:'}
                          </Text>
                          <Text style={styles.custBillPrevVal}>
                            {formatCurrency(item.previousBalancePaise)}
                          </Text>
                        </View>

                        {item.creditTotal > 0 && (
                          <View style={styles.custBillSummaryRow}>
                            <Text style={styles.custBillSummaryLabel}>
                              ➕ {language === 'hi' ? 'आज का उधार:' : 'Today Udhaar:'}
                            </Text>
                            <Text style={[styles.custBillSummaryVal, { color: Colors.creditSale }]}>
                              + {formatCurrency(item.creditTotal)}
                            </Text>
                          </View>
                        )}

                        {item.paymentTotal > 0 && (
                          <View style={styles.custBillSummaryRow}>
                            <Text style={styles.custBillSummaryLabel}>
                              ➖ {language === 'hi' ? 'आज की जमा:' : 'Today Jama:'}
                            </Text>
                            <Text style={[styles.custBillSummaryVal, { color: Colors.paymentReceived }]}>
                              - {formatCurrency(item.paymentTotal)}
                            </Text>
                          </View>
                        )}

                        <View style={[styles.custBillSummaryRow, styles.custBillClosingRow]}>
                          <Text style={styles.custBillClosingLabel}>
                            ⭐ {language === 'hi' ? 'कुल अंतिम बकाया:' : 'Net Total Due:'}
                          </Text>
                          <Text
                            style={[
                              styles.custBillClosingVal,
                              {
                                color:
                                  item.finalClosingDuePaise >= 0
                                    ? Colors.creditSale
                                    : Colors.paymentReceived,
                              },
                            ]}
                          >
                            {formatCurrency(item.finalClosingDuePaise)}
                          </Text>
                        </View>
                      </View>

                      {/* Action Buttons Row */}
                      <View style={styles.custBillActionsRow}>
                        <TouchableOpacity
                          style={styles.custBillWhatsAppBtn}
                          activeOpacity={0.8}
                          onPress={() => handleShareCustomerWhatsApp(item)}
                        >
                          <Ionicons name="logo-whatsapp" size={15} color="#FFFFFF" />
                          <Text style={styles.custBillWhatsAppBtnText}>
                            {language === 'hi' ? 'WhatsApp भेजें' : 'WhatsApp'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.custBillPdfBtn}
                          activeOpacity={0.8}
                          disabled={isExportingPdf}
                          onPress={() => handleExportCustomerPdf(item)}
                        >
                          <Ionicons name="document-text-outline" size={14} color={Colors.primary} />
                          <Text style={styles.custBillPdfBtnText}>
                            {isExportingPdf
                              ? language === 'hi'
                                ? 'बन रहा है...'
                                : 'PDF...'
                              : language === 'hi'
                              ? 'PDF पर्ची'
                              : 'PDF Bill'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.custBillLedgerLinkBtn}
                          activeOpacity={0.8}
                          onPress={() => navigation.navigate('CustomerLedger', { customer: cust })}
                        >
                          <Text style={styles.custBillLedgerLinkText}>
                            {language === 'hi' ? 'खाता →' : 'Ledger →'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              ) : (
                /* Flat All Entries in Period */
                periodStats.filteredTxs.map((tx) => {
                  const isSale = tx.type === 'CREDIT_SALE';
                  const cust = customerMap.get(tx.customerId);
                  const custItem = customerPeriodBreakdown.find((b) => b.customer.id === tx.customerId);

                  return (
                    <TouchableOpacity
                      key={tx.id}
                      style={styles.periodTxRow}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (custItem) {
                          setSelectedCustBill(custItem);
                        } else if (cust) {
                          navigation.navigate('CustomerLedger', { customer: cust });
                        }
                      }}
                    >
                      <View style={styles.txDateBadge}>
                        <Text style={styles.txDateBadgeText}>{formatUpperDate(tx.date)}</Text>
                      </View>
                      <View style={{ flex: 1, paddingHorizontal: Spacing.sm }}>
                        <Text style={styles.txCustName}>{cust?.name || 'Customer'}</Text>
                        <Text style={styles.txDesc} numberOfLines={1}>
                          {tx.description} {cust?.villageName ? `• ${cust.villageName}` : ''}
                        </Text>
                        {tx.quantity ? (
                          <Text style={{ fontSize: 10, color: Colors.textSecondary, marginTop: 1 }}>
                            {tx.quantity} {tx.unit || ''} {tx.ratePaise ? `@ ₹${toRupees(tx.ratePaise)}` : ''}
                          </Text>
                        ) : null}
                      </View>
                      <View style={{ alignItems: 'flex-end', marginRight: 6 }}>
                        <Text
                          style={[
                            styles.txAmount,
                            { color: isSale ? Colors.creditSale : Colors.paymentReceived },
                          ]}
                        >
                          {isSale ? '+' : '-'} {formatCurrency(tx.amountPaise)}
                        </Text>
                        <Text style={styles.txTypeTag}>
                          {isSale ? (language === 'hi' ? 'उधार' : 'Credit') : (language === 'hi' ? 'जमा' : 'Jama')}
                        </Text>
                      </View>
                      {custItem ? (
                        <TouchableOpacity
                          style={styles.entryQuickWhatsAppBtn}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleShareCustomerWhatsApp(custItem);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="logo-whatsapp" size={15} color="#16A34A" />
                        </TouchableOpacity>
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </Card>
          </>
        )}

        {/* ========================================================================= */}
        {/* REPORT 3: VILLAGE-WISE DUE REPORT */}
        {/* ========================================================================= */}
        {selectedReport === 'VILLAGE_REPORT' && (
          <View style={styles.villageSection}>
            <Card style={styles.villageReportTile}>
              <View style={styles.tileHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tileTitle}>{t('villageDueReportTitle', language)}</Text>
                  <Text style={styles.tileSub}>
                    {villages.length} {t('totalVillages', language)} • {t('totalOutstanding', language)}: {formatCurrency(totalOutstandingAll)}
                  </Text>
                </View>
                <Button
                  title={t('pdfShareBtn', language)}
                  onPress={handleExportVillagePdf}
                  loading={exporting}
                  size="sm"
                  variant="outline"
                  icon={<Ionicons name="share-outline" size={14} color={Colors.primary} />}
                />
              </View>

              <View style={styles.villageStatsSummaryRow}>
                <View style={styles.villageSummaryBox}>
                  <Text style={styles.villageSummaryNum}>{villages.length}</Text>
                  <Text style={styles.villageSummaryLabel}>{t('totalVillages', language)}</Text>
                </View>
                <View style={styles.villageSummaryBox}>
                  <Text style={styles.villageSummaryNum}>
                    {villages.reduce((sum, v) => sum + (v.customerCount || 0), 0)}
                  </Text>
                  <Text style={styles.villageSummaryLabel}>{t('totalCustomers', language)}</Text>
                </View>
                <View style={styles.villageSummaryBox}>
                  <Text style={[styles.villageSummaryNum, { color: Colors.creditSale }]}>
                    {formatCurrency(totalOutstandingAll)}
                  </Text>
                  <Text style={styles.villageSummaryLabel}>{t('totalOutstanding', language)}</Text>
                </View>
              </View>
            </Card>

            <View style={styles.villageListHeader}>
              <Text style={styles.villageListTitle}>
                {language === 'hi' ? 'सभी गाँव की देय स्थिति' : 'All Villages Due Breakdown'} ({villages.length})
              </Text>
            </View>

            {villages.length === 0 ? (
              <Card style={styles.emptyVillageCard}>
                <Ionicons name="business-outline" size={36} color={Colors.textSecondary} />
                <Text style={styles.emptyVillageText}>
                  {language === 'hi' ? 'कोई गाँव पंजीकृत नहीं है।' : 'No villages registered yet.'}
                </Text>
              </Card>
            ) : (
              villages.map((v) => {
                const vCusts = customers.filter((c) =>
                  v.villageId === 'other'
                    ? !c.villageId || c.villageId === 'other'
                    : c.villageId === v.villageId
                );
                const vCustsWithMobile = vCusts.filter((c) => !!c.mobile);
                const isExpanded = !!expandedVillages[v.villageId];

                return (
                  <View key={v.villageId} style={styles.villageCardDetailed}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate('VillageDetail', { villageSummary: v })}
                    >
                      <View style={styles.villageCardTop}>
                        <View style={styles.villageCardIconBox}>
                          <Ionicons name="business" size={20} color={Colors.warning} />
                        </View>
                        <View style={{ flex: 1, paddingHorizontal: Spacing.sm }}>
                          <Text style={styles.villageCardName}>{v.villageName}</Text>
                          <Text style={styles.villageCardSub}>
                            {v.customerCount} {t('customersCountLabel', language)} • {v.customersWithDueCount} {t('withDuesCountLabel', language)}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.villageCardDue}>{formatCurrency(v.totalOutstandingPaise)}</Text>
                          <View style={[styles.villageStatusPill, { backgroundColor: v.totalOutstandingPaise > 0 ? '#FEF2F2' : '#F0FDF4' }]}>
                            <Text style={[styles.villageStatusPillText, { color: v.totalOutstandingPaise > 0 ? Colors.creditSale : Colors.paymentReceived }]}>
                              {v.totalOutstandingPaise > 0 ? t('statusDue', language) : t('statusSettled', language)}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.villageCardBottom}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.villageStatMini} numberOfLines={1}>
                            {t('debit', language)}: <Text style={{ color: Colors.creditSale, fontWeight: '700' }}>{formatCurrency(v.totalCreditPaise)}</Text>
                            {'  •  '}
                            {t('credit', language)}: <Text style={{ color: Colors.paymentReceived, fontWeight: '700' }}>{formatCurrency(v.totalPaymentPaise)}</Text>
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={styles.villageCallToggleBtn}
                          onPress={(e) => {
                            e.stopPropagation();
                            setExpandedVillages((prev) => ({
                              ...prev,
                              [v.villageId]: !prev[v.villageId],
                            }));
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel={language === 'hi' ? 'गाँव के ग्राहकों को कॉल करें' : 'Call customers of this village'}
                        >
                          <Ionicons name="call" size={12} color="#1D4ED8" />
                          <Text style={styles.villageCallToggleText}>
                            {language === 'hi' ? 'ग्राहक कॉल' : 'Call'} ({vCustsWithMobile.length})
                          </Text>
                          <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={13}
                            color="#1D4ED8"
                          />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>

                    {/* Expandable Village Customer Call List */}
                    {isExpanded && (
                      <View style={styles.expandedVillageCustomersBox}>
                        <View style={styles.expandedBoxHeader}>
                          <Text style={styles.expandedBoxTitle}>
                            {language === 'hi' ? `${v.villageName} के ग्राहक` : `Customers in ${v.villageName}`} ({vCusts.length})
                          </Text>
                          <TouchableOpacity
                            onPress={() => navigation.navigate('VillageDetail', { villageSummary: v })}
                            style={styles.openVillageDetailLink}
                          >
                            <Text style={styles.openVillageDetailLinkText}>
                              {language === 'hi' ? 'पूरा खाता देखें →' : 'View Full →'}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {vCusts.length === 0 ? (
                          <Text style={styles.emptyVillageCustText}>
                            {language === 'hi' ? 'इस गाँव में कोई ग्राहक नहीं है।' : 'No customers in this village.'}
                          </Text>
                        ) : (
                          vCusts.map((cust) => {
                            const isCustDue = (cust.currentBalancePaise || 0) > 0;
                            return (
                              <TouchableOpacity
                                key={cust.id}
                                style={styles.villageCustRow}
                                activeOpacity={0.7}
                                onPress={() => navigation.navigate('CustomerLedger', { customer: cust })}
                              >
                                <View style={{ flex: 1, marginRight: 8 }}>
                                  <Text style={styles.villageCustName}>{cust.name}</Text>
                                  <Text
                                    style={[
                                      styles.villageCustBal,
                                      isCustDue ? { color: Colors.creditSale } : { color: Colors.paymentReceived },
                                    ]}
                                  >
                                    {formatCurrency(Math.abs(cust.currentBalancePaise || 0))}{' '}
                                    <Text style={styles.villageCustBalTag}>
                                      {isCustDue
                                        ? (language === 'hi' ? 'बाकी' : 'Due')
                                        : (cust.currentBalancePaise || 0) < 0
                                        ? (language === 'hi' ? 'जमा' : 'Advance')
                                        : (language === 'hi' ? 'शून्य' : 'Settled')}
                                    </Text>
                                  </Text>
                                </View>

                                <View style={styles.villageCustActionsRow}>
                                  {cust.mobile ? (
                                    <TouchableOpacity
                                      style={styles.callReminderBtn}
                                      onPress={(e) => {
                                        e.stopPropagation();
                                        callPhoneNumber(cust.mobile, cust.name);
                                      }}
                                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                      accessibilityLabel={`${t('callCustomer', language)}: ${cust.name}`}
                                    >
                                      <Ionicons name="call" size={12} color="#1D4ED8" />
                                      <Text style={styles.callReminderText}>{t('callCustomer', language)}</Text>
                                    </TouchableOpacity>
                                  ) : null}

                                  {cust.mobile && isCustDue ? (
                                    <TouchableOpacity
                                      style={styles.whatsappReminderBtn}
                                      onPress={(e) => {
                                        e.stopPropagation();
                                        handleSendReminder(cust);
                                      }}
                                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                    >
                                      <Ionicons name="logo-whatsapp" size={13} color="#22C55E" />
                                      <Text style={styles.whatsappReminderText}>
                                        {language === 'hi' ? 'तगादा' : 'Remind'}
                                      </Text>
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                              </TouchableOpacity>
                            );
                          })
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Interactive Calendar Date Picker Modal */}
      <Modal
        visible={calendarModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.calendarModalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {targetDateField === 'FROM' ? t('selectFromDate', language) : t('selectToDate', language)}
                </Text>
                <Text style={styles.modalSelectedDateDisplay}>
                  {formatUpperDate(activeCompareDate)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setCalendarModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Month & Year Navigation Bar */}
            <View style={styles.monthNavRow}>
              <TouchableOpacity onPress={prevMonth} style={styles.monthNavBtn}>
                <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.monthNavText}>
                {monthNames[viewMonth]} {viewYear}
              </Text>
              <TouchableOpacity onPress={nextMonth} style={styles.monthNavBtn}>
                <Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Days of Week Header */}
            <View style={styles.weekDaysRow}>
              {daysOfWeek.map((day) => (
                <Text key={day} style={styles.weekDayText}>
                  {day}
                </Text>
              ))}
            </View>

            {/* Days Grid */}
            <View style={styles.daysGrid}>
              {calendarDays.map((day, idx) => {
                if (day === null) {
                  return <View key={`empty-${idx}`} style={styles.dayCellEmpty} />;
                }
                const formattedThisCell = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isSelected = formattedThisCell === activeCompareDate;
                const isTodayCell = formattedThisCell === todayStr;

                return (
                  <TouchableOpacity
                    key={`day-${day}`}
                    style={[
                      styles.dayCell,
                      isSelected && styles.selectedDayCell,
                      isTodayCell && !isSelected && styles.todayDayCell,
                    ]}
                    onPress={() => selectDay(day)}
                  >
                    <Text
                      style={[
                        styles.dayCellText,
                        isSelected && styles.selectedDayCellText,
                        isTodayCell && !isSelected && styles.todayDayCellText,
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Modal Quick Shortcut Buttons */}
            <View style={styles.modalQuickRow}>
              <TouchableOpacity
                style={styles.modalQuickBtn}
                onPress={() => {
                  if (targetDateField === 'FROM') {
                    setFromDate(todayStr);
                    if (todayStr > toDate) setToDate(todayStr);
                  } else {
                    setToDate(todayStr);
                    if (todayStr < fromDate) setFromDate(todayStr);
                  }
                  setCalendarModalVisible(false);
                }}
              >
                <Text style={styles.modalQuickBtnText}>{t('presetToday', language)} ({formatUpperDate(todayStr)})</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* CUSTOMER BILL PREVIEW MODAL */}
      {/* ========================================================================= */}
      <Modal
        visible={!!selectedCustBill}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedCustBill(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.billModalContent}>
            {/* Modal Header */}
            <View style={styles.billModalHeader}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.billModalTitle}>
                  {language === 'hi' ? 'ग्राहक खाता पर्ची / रसीद' : 'Customer Ledger Bill'}
                </Text>
                <Text style={styles.billModalSub} numberOfLines={1}>
                  {selectedCustBill?.customer.name}
                  {selectedCustBill?.customer.villageName ? ` (${selectedCustBill.customer.villageName})` : ''}
                  {selectedCustBill?.customer.mobile ? ` • ${selectedCustBill.customer.mobile}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedCustBill(null)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Modal Scrollable Body */}
            <ScrollView style={styles.billModalBody} showsVerticalScrollIndicator={false}>
              {/* Period banner */}
              <View style={styles.billPeriodBanner}>
                <Ionicons name="calendar-outline" size={13} color={Colors.primary} />
                <Text style={styles.billPeriodBannerText}>
                  {language === 'hi' ? 'तारीख / अवधि:' : 'Period:'}{' '}
                  <Text style={{ fontWeight: '800', color: Colors.primary }}>
                    {fromDate === toDate
                      ? formatUpperDate(fromDate)
                      : `${formatUpperDate(fromDate)} से ${formatUpperDate(toDate)}`}
                  </Text>
                </Text>
              </View>

              {/* 1. Previous Balance */}
              <View style={styles.billPrevBalanceBox}>
                <View>
                  <Text style={styles.billPrevBalanceLabel}>
                    🟣 {language === 'hi' ? '1. पिछला बकाया' : '1. Previous Due'}
                  </Text>
                  <Text style={styles.billPrevBalanceSub}>
                    {formatUpperDate(fromDate)} {language === 'hi' ? 'से पूर्व का शेष' : 'opening balance'}
                  </Text>
                </View>
                <Text style={styles.billPrevBalanceVal}>
                  {formatCurrency(selectedCustBill?.previousBalancePaise || 0)}
                </Text>
              </View>

              {/* 2. Itemized transactions */}
              <Text style={styles.billEntriesHeading}>
                📝 {language === 'hi' ? 'इस अवधि का लेन-देन' : 'Transactions in Period'} ({selectedCustBill?.txs.length || 0})
              </Text>

              {selectedCustBill?.txs.map((tx, idx) => {
                const isSale = tx.type === 'CREDIT_SALE';
                return (
                  <View key={tx.id} style={styles.billEntryRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.billEntryDesc}>
                        {idx + 1}. {tx.description || (isSale ? (language === 'hi' ? 'उधार बिक्री' : 'Credit Sale') : (language === 'hi' ? 'जमा भुगतान' : 'Payment'))}
                      </Text>
                      {tx.quantity ? (
                        <Text style={styles.billEntryQty}>
                          {language === 'hi' ? 'मात्रा' : 'Qty'}: {tx.quantity} {tx.unit || ''}{tx.ratePaise ? ` @ ₹${toRupees(tx.ratePaise)}` : ''}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.billEntryAmount, { color: isSale ? Colors.creditSale : Colors.paymentReceived }]}>
                        {isSale ? '+' : '-'} {formatCurrency(tx.amountPaise)}
                      </Text>
                      <Text style={styles.billEntryTag}>
                        {isSale ? (language === 'hi' ? 'उधार' : 'Udhaar') : (language === 'hi' ? 'जमा' : 'Jama')}
                      </Text>
                    </View>
                  </View>
                );
              })}

              {/* 3. Accounting totals */}
              <View style={styles.billTotalsCard}>
                <View style={styles.billTotalRow}>
                  <Text style={styles.billTotalLabel}>
                    ➕ {language === 'hi' ? 'आज का नया उधार:' : 'New Udhaar:'}
                  </Text>
                  <Text style={[styles.billTotalVal, { color: Colors.creditSale }]}>
                    + {formatCurrency(selectedCustBill?.creditTotal || 0)}
                  </Text>
                </View>
                <View style={styles.billTotalRow}>
                  <Text style={styles.billTotalLabel}>
                    ➖ {language === 'hi' ? 'आज की जमा राशि:' : 'Received Jama:'}
                  </Text>
                  <Text style={[styles.billTotalVal, { color: Colors.paymentReceived }]}>
                    - {formatCurrency(selectedCustBill?.paymentTotal || 0)}
                  </Text>
                </View>

                <View style={styles.billGrandTotalDivider} />

                <View style={styles.billTotalRow}>
                  <Text style={styles.billGrandTotalLabel}>
                    ⭐ {language === 'hi' ? 'कुल अंतिम बकाया:' : 'Net Closing Due:'}
                  </Text>
                  <Text
                    style={[
                      styles.billGrandTotalVal,
                      {
                        color:
                          (selectedCustBill?.finalClosingDuePaise || 0) >= 0
                            ? Colors.creditSale
                            : Colors.paymentReceived,
                      },
                    ]}
                  >
                    {formatCurrency(selectedCustBill?.finalClosingDuePaise || 0)}
                  </Text>
                </View>

                <View style={styles.billWordsBox}>
                  <Text style={styles.billWordsLabel}>
                    {language === 'hi' ? 'शब्दों में:' : 'In Words:'}
                  </Text>
                  <Text style={styles.billWordsVal}>
                    {amountInWords(selectedCustBill?.finalClosingDuePaise || 0)}
                  </Text>
                </View>
              </View>
            </ScrollView>

            {/* Modal Actions Footer */}
            <View style={styles.billModalFooter}>
              <TouchableOpacity
                style={styles.billModalWhatsAppBtn}
                activeOpacity={0.8}
                onPress={() => {
                  if (selectedCustBill) {
                    handleShareCustomerWhatsApp(selectedCustBill);
                  }
                }}
              >
                <Ionicons name="logo-whatsapp" size={17} color="#FFFFFF" />
                <Text style={styles.billModalWhatsAppBtnText}>
                  {language === 'hi' ? 'WhatsApp भेजें' : 'WhatsApp'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.billModalPdfBtn}
                activeOpacity={0.8}
                disabled={exportingCustomerPdfId === selectedCustBill?.customer.id}
                onPress={() => {
                  if (selectedCustBill) {
                    handleExportCustomerPdf(selectedCustBill);
                  }
                }}
              >
                <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
                <Text style={styles.billModalPdfBtnText}>
                  {exportingCustomerPdfId === selectedCustBill?.customer.id
                    ? language === 'hi'
                      ? 'बन रहा है...'
                      : 'PDF...'
                    : language === 'hi'
                    ? 'PDF पर्ची'
                    : 'PDF Bill'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  reportSelectorBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    justifyContent: 'space-between',
    gap: 8,
  },
  reportSelectorTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: BorderRadius.md,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 5,
  },
  activeReportSelectorTab: {
    backgroundColor: '#EFF6FF',
    borderColor: Colors.primary,
  },
  reportSelectorText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activeReportSelectorText: {
    color: Colors.primary,
    fontWeight: '800',
  },
  tabBadge: {
    backgroundColor: '#E2E8F0',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tabBadgeActive: {
    backgroundColor: Colors.primary,
  },
  tabBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  tabBadgeTextActive: {
    color: '#FFFFFF',
  },
  villageSection: {
    marginTop: Spacing.xs,
  },
  villageStatsSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  villageSummaryBox: {
    flex: 1,
    alignItems: 'center',
  },
  villageSummaryNum: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  villageSummaryLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  villageListHeader: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  villageListTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  villageCardDetailed: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  villageCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  villageCardIconBox: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  villageCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  villageCardSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  villageCardDue: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.creditSale,
  },
  villageStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginTop: 2,
  },
  villageStatusPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  villageCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  villageStatMini: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  villageCallToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  villageCallToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  expandedVillageCustomersBox: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  expandedBoxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  expandedBoxTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  openVillageDetailLink: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  openVillageDetailLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  emptyVillageCustText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 8,
  },
  villageCustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  villageCustName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  villageCustBal: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  villageCustBalTag: {
    fontSize: 10,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  villageCustActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emptyVillageCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    marginTop: Spacing.md,
  },
  emptyVillageText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  customDateCard: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderColor: '#93C5FD',
    borderWidth: 1.5,
  },
  customDateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  customDateCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  datePickersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateSelectorBox: {
    flex: 1,
    backgroundColor: '#F0F9FF',
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    borderRadius: BorderRadius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  dateLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  dateValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateValueText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  dateArrowBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetChipsScroll: {
    marginTop: Spacing.sm,
  },
  presetChip: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginRight: 6,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  periodSummaryCard: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  periodSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  periodHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  pdfPeriodBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor: 'rgba(255,255,255,0.3)',
    marginLeft: 8,
  },
  statsRow: {
    flexDirection: 'row',
  },
  statBox: {
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: '#94A3B8',
  },
  statVal: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: Spacing.md,
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  netLabel: {
    fontSize: 11,
    color: '#CBD5E1',
  },
  netVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  transactionsCard: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  txCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: Spacing.xs,
  },
  txCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  periodTxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  txDateBadge: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: BorderRadius.sm,
  },
  txDateBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  txCustName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  txDesc: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  txAmount: {
    fontSize: 13,
    fontWeight: '800',
  },
  txTypeTag: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  whatsAppSummaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16A34A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
  },
  whatsAppSummaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  emptyPeriodBox: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyPeriodText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  emptyPeriodSub: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  villageReportTile: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  tileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tileTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  tileSub: {
    fontSize: 12,
    color: Colors.creditSale,
    fontWeight: '600',
    marginTop: 2,
  },
  villageRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceSubtle,
  },
  vName: {
    fontSize: 13,
    color: Colors.textPrimary,
  },
  vDue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.creditSale,
  },
  viewAllVillagesBtn: {
    marginTop: Spacing.sm,
    alignItems: 'center',
    paddingTop: Spacing.xs,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  overdueSection: {
    marginTop: Spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  duesMetricsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  dueMetricCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  activeDueMetricCard: {
    borderColor: Colors.primary,
    backgroundColor: '#F8FAFC',
  },
  dueMetricLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  dueMetricValue: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: 4,
  },
  dueMetricCount: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  dueFilterChipsScroll: {
    marginBottom: Spacing.md,
  },
  dueFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  activeDueFilterChip: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  activeDueFilterChipDanger: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  activeDueFilterChipWarning: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  dueFilterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activeDueFilterChipText: {
    color: Colors.textInverse,
    fontWeight: '700',
  },
  activeDueFilterChipDangerText: {
    color: '#991B1B',
    fontWeight: '700',
  },
  activeDueFilterChipWarningText: {
    color: '#92400E',
    fontWeight: '700',
  },
  emptyDueCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyDueText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  overdueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xs,
  },
  overdueItemAlert: {
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.creditSaleLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  avatarOverdue: {
    backgroundColor: '#FEE2E2',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.creditSale,
  },
  custName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  custSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  custDueDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  dueDateBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  dueDateBadgePillText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  statusBadgeOverdue: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeOverdueText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
  },
  statusBadgeToday: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeTodayText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
  },
  statusBadgeUpcoming: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeUpcomingText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#2563EB',
  },
  reportActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 5,
  },
  callReminderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  callReminderText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  whatsappReminderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  whatsappReminderText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  dueAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.creditSale,
  },
  dueTag: {
    fontSize: 10,
    color: Colors.creditSaleText,
    marginTop: 1,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  calendarModalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalSelectedDateDisplay: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primary,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: '#F1F5F9',
  },
  monthNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.md,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  monthNavBtn: {
    padding: 6,
  },
  monthNavText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 6,
  },
  weekDayText: {
    width: 36,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.sm,
    marginVertical: 2,
  },
  dayCellEmpty: {
    width: `${100 / 7}%`,
    height: 38,
  },
  selectedDayCell: {
    backgroundColor: Colors.primary,
  },
  todayDayCell: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  dayCellText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  selectedDayCellText: {
    color: Colors.textInverse,
    fontWeight: '800',
  },
  todayDayCellText: {
    color: Colors.primary,
    fontWeight: '800',
  },
  modalQuickRow: {
    marginTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  modalQuickBtn: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  modalQuickBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  /* Customer-wise Date Bill Styles */
  viewModeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: BorderRadius.md,
    padding: 2,
    gap: 2,
  },
  viewModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  viewModeBtnActive: {
    backgroundColor: Colors.primary,
  },
  viewModeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  viewModeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  custBillCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  custBillCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Spacing.xs,
  },
  custBillAvatar: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  custBillAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primary,
  },
  custBillName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  txCountBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  txCountBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  custBillSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  previewIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  previewIconBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  custBillSummaryBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing.xs,
    marginTop: 4,
  },
  custBillSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  custBillSummaryLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  custBillPrevVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7C3AED',
  },
  custBillSummaryVal: {
    fontSize: 11,
    fontWeight: '700',
  },
  custBillClosingRow: {
    backgroundColor: '#EFF6FF',
    borderRadius: BorderRadius.sm,
    marginTop: 2,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  custBillClosingLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  custBillClosingVal: {
    fontSize: 13,
    fontWeight: '900',
  },
  custBillActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.sm,
    paddingTop: 4,
  },
  custBillWhatsAppBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#16A34A',
    paddingVertical: 7,
    borderRadius: BorderRadius.md,
  },
  custBillWhatsAppBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  custBillPdfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#F0F9FF',
    borderWidth: 1.2,
    borderColor: '#BAE6FD',
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
  },
  custBillPdfBtnText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 11,
  },
  custBillLedgerLinkBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    backgroundColor: '#F1F5F9',
  },
  custBillLedgerLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  entryQuickWhatsAppBtn: {
    padding: 6,
    backgroundColor: '#DCFCE7',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Bill Preview Modal Styles */
  billModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    width: '94%',
    maxHeight: '88%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  billModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: '#F8FAFC',
  },
  billModalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  billModalSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  billModalBody: {
    padding: Spacing.md,
  },
  billPeriodBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: Spacing.sm,
  },
  billPeriodBannerText: {
    fontSize: 11,
    color: Colors.textPrimary,
  },
  billPrevBalanceBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FAF5FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  billPrevBalanceLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7C3AED',
  },
  billPrevBalanceSub: {
    fontSize: 9,
    color: '#6B21A8',
    marginTop: 1,
  },
  billPrevBalanceVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#7C3AED',
  },
  billEntriesHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  billEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  billEntryDesc: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  billEntryQty: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  billEntryAmount: {
    fontSize: 13,
    fontWeight: '800',
  },
  billEntryTag: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  billTotalsCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  billTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  billTotalLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  billTotalVal: {
    fontSize: 12,
    fontWeight: '700',
  },
  billGrandTotalDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  billGrandTotalLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  billGrandTotalVal: {
    fontSize: 15,
    fontWeight: '900',
  },
  billWordsBox: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  billWordsLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  billWordsVal: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 1,
  },
  billModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: '#F8FAFC',
  },
  billModalWhatsAppBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#16A34A',
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
  },
  billModalWhatsAppBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  billModalPdfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#F0F9FF',
    borderWidth: 1.2,
    borderColor: '#BAE6FD',
    paddingVertical: 9,
    borderRadius: BorderRadius.md,
  },
  billModalPdfBtnText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
});
