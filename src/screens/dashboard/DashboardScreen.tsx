import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { LedgerRow } from '../../components/LedgerRow';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { t } from '../../i18n';
import { formatCurrency } from '../../utils/money';
import { formatUpperDate } from '../../utils/date';
import { calculateDashboardMetrics } from '../../services/accounting';
import { DataRepository } from '../../services/db';
import { DashboardMetrics, Transaction, Customer } from '../../types';
import { Ionicons } from '@expo/vector-icons';

export const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { business, language, refreshAllData, guardAction } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalOutstandingPaise: 0,
    todayCreditSalesPaise: 0,
    todayPaymentsReceivedPaise: 0,
    totalCustomers: 0,
    customersWithDueCount: 0,
    totalVillages: 0,
    thisMonthCreditSalesPaise: 0,
    thisMonthPaymentsPaise: 0,
  });
  const [recentTx, setRecentTx] = useState<Transaction[]>([]);
  const [topDueCustomers, setTopDueCustomers] = useState<Customer[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);

  const loadData = useCallback(async () => {
    if (!business) return;
    const [custs, txs, villages] = await Promise.all([
      DataRepository.getCustomers(business.id),
      DataRepository.getTransactions(business.id),
      DataRepository.getVillages(business.id),
    ]);

    const m = calculateDashboardMetrics(custs, txs, villages.length);
    setMetrics(m);

    const sortedTx = [...txs].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
    setRecentTx(sortedTx.slice(0, 5));

    setAllCustomers(custs);
    const withDues = custs
      .filter((c) => (c.currentBalancePaise || 0) > 0)
      .sort((a, b) => (b.currentBalancePaise || 0) - (a.currentBalancePaise || 0));
    setTopDueCustomers(withDues.slice(0, 4));
  }, [business]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAllData();
    await loadData();
    setRefreshing(false);
  };

  return (
    <View style={styles.screen}>
      <Header />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
      >
        {/* Main Hero Card: Total Outstanding Due */}
        <Card style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.heroSubLabel}>{t('totalOutstanding', language)}</Text>
              <Text style={styles.heroAmount}>{formatCurrency(metrics.totalOutstandingPaise)}</Text>
            </View>
            <View style={styles.heroBadgeBox}>
              <Badge
                label={`${metrics.customersWithDueCount} ${t('customersWithDues', language)}`}
                variant="danger"
                size="md"
              />
            </View>
          </View>

          {/* Today's Stats Row */}
          <View style={styles.todayStatsRow}>
            <View style={[styles.todayStatBox, styles.statBorderRight]}>
              <View style={styles.statIconRow}>
                <Ionicons name="arrow-up-circle" size={18} color={Colors.creditSale} />
                <Text style={styles.todayStatLabel}>{t('todayCreditSales', language)}</Text>
              </View>
              <Text style={[styles.todayStatVal, { color: Colors.creditSale }]}>
                {formatCurrency(metrics.todayCreditSalesPaise)}
              </Text>
            </View>

            <View style={styles.todayStatBox}>
              <View style={styles.statIconRow}>
                <Ionicons name="arrow-down-circle" size={18} color={Colors.paymentReceived} />
                <Text style={styles.todayStatLabel}>{t('todayPayments', language)}</Text>
              </View>
              <Text style={[styles.todayStatVal, { color: Colors.paymentReceived }]}>
                {formatCurrency(metrics.todayPaymentsReceivedPaise)}
              </Text>
            </View>
          </View>
        </Card>

        {/* Primary Quick Action Buttons (Add Entry: Udhaar & Jama) */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.bigActionBtn, styles.giveCreditBtn]}
            onPress={() => guardAction(() => navigation.navigate('AddEntry', { initialMode: 'CREDIT' }))}
          >
            <View style={styles.btnIconCircleRed}>
              <Ionicons name="add-circle" size={26} color={Colors.creditSale} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionBtnTitle}>Add Entry</Text>
              <Text style={styles.actionBtnSubtitle}>{t('giveCreditDesc', language)}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.bigActionBtn, styles.receivePaymentBtn]}
            onPress={() => guardAction(() => navigation.navigate('AddEntry', { initialMode: 'PAYMENT' }))}
          >
            <View style={styles.btnIconCircleGreen}>
              <Ionicons name="add-circle" size={26} color={Colors.paymentReceived} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionBtnTitle}>{language === 'hi' ? 'जमा प्रविष्टि (-)' : 'Payment Entry (-)'}</Text>
              <Text style={styles.actionBtnSubtitle}>{t('receivePaymentDesc', language)}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Secondary Quick Action Grid */}
        <View style={styles.gridRow}>
          <TouchableOpacity
            style={styles.gridCard}
            onPress={() => guardAction(() => navigation.navigate('AddCustomer'))}
          >
            <Ionicons name="person-add" size={22} color={Colors.primary} />
            <Text style={styles.gridCardTitle}>{t('addCustomer', language)}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.gridCard}
            onPress={() => navigation.navigate('VillagesTab')}
          >
            <Ionicons name="business" size={22} color={Colors.warning} />
            <Text style={styles.gridCardTitle}>{t('villageReport', language)}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.gridCard}
            onPress={() => navigation.navigate('ReportsTab')}
          >
            <Ionicons name="bar-chart" size={22} color={Colors.info} />
            <Text style={styles.gridCardTitle}>{t('navReports', language)}</Text>
          </TouchableOpacity>
        </View>

        {/* Customer & Village Metrics Bar */}
        <View style={styles.kpiBar}>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiVal}>{metrics.totalCustomers}</Text>
            <Text style={styles.kpiLabel}>{t('totalCustomers', language)}</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiVal, { color: Colors.creditSale }]}>{metrics.customersWithDueCount}</Text>
            <Text style={styles.kpiLabel}>{t('customersWithDues', language)}</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            <Text style={styles.kpiVal}>{metrics.totalVillages}</Text>
            <Text style={styles.kpiLabel}>{t('totalVillages', language)}</Text>
          </View>
        </View>

        {/* Top Due Customers Section */}
        {topDueCustomers.length > 0 && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('topDues', language)}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('CustomersTab')}>
                <Text style={styles.seeAllText}>{t('seeAll', language)} →</Text>
              </TouchableOpacity>
            </View>

            {topDueCustomers.map((cust) => (
              <TouchableOpacity
                key={cust.id}
                activeOpacity={0.8}
                style={styles.topDueItem}
                onPress={() => navigation.navigate('CustomerLedger', { customer: cust })}
              >
                <View style={styles.custAvatar}>
                  <Text style={styles.avatarText}>{cust.name.charAt(0)}</Text>
                </View>
                <View style={styles.custInfo}>
                  <Text style={styles.custName}>{cust.name}</Text>
                  <Text style={styles.custVillage}>
                    {cust.villageName || t('noVillageRecorded', language)}
                    {cust.dueDate ? ` • देय: ${formatUpperDate(cust.dueDate)}` : ''}
                  </Text>
                </View>
                <View style={styles.custDueBox}>
                  <Text style={styles.custDueAmount}>{formatCurrency(cust.currentBalancePaise)}</Text>
                  <Text style={styles.dueTag}>{t('statusDue', language)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Recent Transactions Section */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('recentTransactions', language)}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('CustomersTab')}>
              <Text style={styles.seeAllText}>{t('viewLedger', language)} →</Text>
            </TouchableOpacity>
          </View>

          {recentTx.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>{t('noRecentTransactions', language)}</Text>
            </Card>
          ) : (
            <Card style={styles.recentListCard}>
              {recentTx.map((tx) => (
                <LedgerRow
                  key={tx.id}
                  transaction={tx}
                  onPress={() => {
                    const customer = allCustomers.find((c) => c.id === tx.customerId);
                    if (customer) {
                      navigation.navigate('CustomerLedger', { customer });
                    }
                  }}
                />
              ))}
            </Card>
          )}
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Floating Action Button for Instant Transaction */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('AddEntry')}
      >
        <Ionicons name="add" size={32} color={Colors.textInverse} />
      </TouchableOpacity>
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
  heroCard: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    padding: Spacing.xl,
    borderRadius: BorderRadius.xl,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroSubLabel: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  heroAmount: {
    ...Typography.amountLarge,
    color: '#F8FAFC',
    marginTop: 4,
  },
  heroBadgeBox: {
    alignItems: 'flex-end',
  },
  todayStatsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  todayStatBox: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  statBorderRight: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.1)',
  },
  statIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  todayStatLabel: {
    fontSize: 11,
    color: '#CBD5E1',
  },
  todayStatVal: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginVertical: Spacing.md,
  },
  bigActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    gap: Spacing.sm,
  },
  giveCreditBtn: {
    backgroundColor: Colors.creditSaleLight,
    borderColor: '#FCA5A5',
  },
  receivePaymentBtn: {
    backgroundColor: Colors.paymentReceivedLight,
    borderColor: '#86EFAC',
  },
  btnIconCircleRed: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnIconCircleGreen: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  actionBtnSubtitle: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  gridRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  gridCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridCardTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 6,
    textAlign: 'center',
  },
  kpiBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
  },
  kpiItem: {
    flex: 1,
    alignItems: 'center',
  },
  kpiDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  kpiVal: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  kpiLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  sectionContainer: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  seeAllText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
  topDueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xs,
  },
  custAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  custInfo: {
    flex: 1,
  },
  custName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  custVillage: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  custDueBox: {
    alignItems: 'flex-end',
  },
  custDueAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.creditSale,
  },
  dueTag: {
    fontSize: 10,
    color: Colors.creditSaleText,
    marginTop: 2,
  },
  emptyCard: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  recentListCard: {
    padding: 0,
    overflow: 'hidden',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
});
