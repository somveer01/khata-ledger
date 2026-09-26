import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { t } from '../../i18n';
import { formatCurrency } from '../../utils/money';
import { getTodayIST, formatUpperDate } from '../../utils/date';
import { DataRepository } from '../../services/db';
import { PdfService } from '../../services/pdfService';
import { ReminderService } from '../../services/reminderService';
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
  const { business, language } = useApp();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [villages, setVillages] = useState<VillageSummary[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportingDateRange, setExportingDateRange] = useState(false);

  // Active Report Tab: 'DUE_REPORT' | 'TRANSACTIONS' | 'VILLAGE_REPORT'
  type ReportTab = 'DUE_REPORT' | 'TRANSACTIONS' | 'VILLAGE_REPORT';
  const [selectedReport, setSelectedReport] = useState<ReportTab>('DUE_REPORT');

  // Date Filter State (defaults to Today: e.g. '2026-09-23')
  const todayStr = getTodayIST();
  const [fromDate, setFromDate] = useState<string>(todayStr);
  const [toDate, setToDate] = useState<string>(todayStr);

  // Calendar Modal State
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [targetDateField, setTargetDateField] = useState<'FROM' | 'TO'>('FROM');
  const [viewYear, setViewYear] = useState<number>(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(new Date().getMonth());

  useEffect(() => {
    const load = async () => {
      if (!business) return;
      const [c, tx, v] = await Promise.all([
        DataRepository.getCustomers(business.id),
        DataRepository.getTransactions(business.id),
        DataRepository.getVillageSummaries(business.id),
      ]);
      setCustomers(c);
      setTransactions(tx);
      setVillages(v);
    };
    load();
  }, [business]);

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
      const uri = await PdfService.generateDateRangeReportPdf(
        business,
        fromDate,
        toDate,
        txWithDetails,
        periodStats.creditTotal,
        periodStats.paymentTotal
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

  const dateRangeHeading = fromDate === toDate
    ? `${t('periodSummaryTitleCustom', language)} (${formatUpperDate(fromDate)})`
    : `${t('periodSummaryTitleCustom', language)} (${formatUpperDate(fromDate)} - ${formatUpperDate(toDate)})`;

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
                        {cust.villageName || '-'} • {cust.mobile}
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
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.whatsappReminderBtn}
                        onPress={() => handleSendReminder(cust)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="logo-whatsapp" size={16} color="#22C55E" />
                        <Text style={styles.whatsappReminderText}>{language === 'hi' ? 'तगादा' : 'Remind'}</Text>
                      </TouchableOpacity>
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

            {/* Period Summary Card */}
            <Card style={styles.periodSummaryCard}>
              <View style={styles.periodSummaryHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.periodHeading}>
                    {dateRangeHeading}
                  </Text>
                </View>

                {/* PDF Export button */}
                <Button
                  title={t('pdfShareBtn', language)}
                  onPress={handleExportDateRangePdf}
                  loading={exportingDateRange}
                  size="sm"
                  variant="outline"
                  icon={<Ionicons name="share-outline" size={14} color={Colors.primaryForeground} />}
                  style={styles.pdfPeriodBtn}
                />
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t('totalCreditLabel', language)}</Text>
                  <Text style={[styles.statVal, { color: Colors.creditSale }]}>
                    {formatCurrency(periodStats.creditTotal)}
                  </Text>
                </View>

                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t('totalJamaLabel', language)}</Text>
                  <Text style={[styles.statVal, { color: Colors.paymentReceived }]}>
                    {formatCurrency(periodStats.paymentTotal)}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.netRow}>
                <Text style={styles.netLabel}>
                  {t('totalTxCountLabel', language)}: <Text style={{ fontWeight: '700', color: '#F8FAFC' }}>{periodStats.txCount}</Text>
                </Text>
                <Text style={styles.netVal}>
                  {t('netDifferenceLabel', language)}: {formatCurrency(periodStats.netDiff)}
                </Text>
              </View>
            </Card>

            {/* Transactions list in Selected Date Range */}
            <Card style={styles.transactionsCard}>
              <View style={styles.txCardHeader}>
                <Text style={styles.txCardTitle}>
                  {t('transactionsInPeriod', language)} ({periodStats.txCount})
                </Text>
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
              ) : (
                periodStats.filteredTxs.map((tx) => {
                  const isSale = tx.type === 'CREDIT_SALE';
                  const cust = customerMap.get(tx.customerId);
                  return (
                    <TouchableOpacity
                      key={tx.id}
                      style={styles.periodTxRow}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (cust) {
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
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.txAmount, { color: isSale ? Colors.creditSale : Colors.paymentReceived }]}>
                          {isSale ? '+' : '-'} {formatCurrency(tx.amountPaise)}
                        </Text>
                        <Text style={styles.txTypeTag}>
                          {isSale ? (language === 'hi' ? 'उधार' : 'Credit') : (language === 'hi' ? 'जमा' : 'Jama')}
                        </Text>
                      </View>
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
              villages.map((v) => (
                <TouchableOpacity
                  key={v.villageId}
                  activeOpacity={0.8}
                  style={styles.villageCardDetailed}
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
                    <Text style={styles.villageStatMini}>
                      {t('debit', language)}: <Text style={{ color: Colors.creditSale, fontWeight: '700' }}>{formatCurrency(v.totalCreditPaise)}</Text>
                    </Text>
                    <Text style={styles.villageStatMini}>
                      {t('credit', language)}: <Text style={{ color: Colors.paymentReceived, fontWeight: '700' }}>{formatCurrency(v.totalPaymentPaise)}</Text>
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
                  </View>
                </TouchableOpacity>
              ))
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
  whatsappReminderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    marginTop: 4,
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
});
