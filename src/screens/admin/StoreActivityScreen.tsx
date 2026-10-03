import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { DataRepository } from '../../services/db';
import { StoreActivityStats, Business } from '../../types';
import { formatCurrency } from '../../utils/money';
import { formatRelativeActivity } from '../../utils/date';
import { t } from '../../i18n';

type FilterType = 'ALL' | 'ACTIVE' | 'INACTIVE';

export const StoreActivityScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { business, language, switchBusiness, isSuperAdmin } = useApp();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<StoreActivityStats[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const data = await DataRepository.getStoreActivityOverview();
      setStats(data);
    } catch (err) {
      console.warn('Error loading store activity stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
  };

  const handleSwitchStore = async (targetBiz: Business) => {
    if (targetBiz.id === business?.id) return;
    setSwitchingId(targetBiz.id);
    try {
      await switchBusiness(targetBiz);
      navigation.navigate('MainTabs', { screen: 'DashboardTab' });
    } finally {
      setSwitchingId(null);
    }
  };

  // Filtered list based on search and tab
  const filteredStats = useMemo(() => {
    let list = [...stats];
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.business.name.toLowerCase().includes(q) ||
          (s.business.ownerName && s.business.ownerName.toLowerCase().includes(q)) ||
          (s.business.phone && s.business.phone.includes(q)) ||
          (s.business.ownerEmail && s.business.ownerEmail.toLowerCase().includes(q))
      );
    }

    if (filter === 'ACTIVE') {
      list = list.filter((s) => s.isActive);
    } else if (filter === 'INACTIVE') {
      list = list.filter((s) => !s.isActive);
    }

    return list;
  }, [stats, search, filter]);

  // Overall system overview counts
  const totalStores = stats.length;
  const activeStores = stats.filter((s) => s.isActive).length;
  const totalSystemCustomers = stats.reduce((sum, s) => sum + s.customerCount, 0);
  const totalSystemTransactions = stats.reduce((sum, s) => sum + s.totalTransactionCount, 0);

  const renderStoreItem = ({ item }: { item: StoreActivityStats }) => {
    const isCurrent = item.business.id === business?.id;
    const isSwitching = switchingId === item.business.id;

    return (
      <Card style={[styles.storeCard, isCurrent && styles.currentStoreCard]}>
        {/* Top Header of Card */}
        <View style={styles.cardHeader}>
          <View style={styles.storeIconBox}>
            <Ionicons name="storefront" size={22} color={Colors.primary} />
          </View>
          <View style={styles.storeMainInfo}>
            <View style={styles.titleRow}>
              <Text numberOfLines={1} style={styles.storeName}>
                {item.business.name}
              </Text>
              {isCurrent && (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>
                    {language === 'hi' ? 'खुली है' : 'Current'}
                  </Text>
                </View>
              )}
            </View>

            <Text numberOfLines={1} style={styles.ownerText}>
              {item.business.ownerName || 'दुकानदार'}
              {item.business.phone ? ` • ${item.business.phone}` : ''}
            </Text>
            {item.business.ownerEmail ? (
              <Text numberOfLines={1} style={styles.emailText}>
                {item.business.ownerEmail}
              </Text>
            ) : null}
          </View>

          {/* Active Status Badge */}
          <View
            style={[
              styles.statusPill,
              item.totalTransactionCount === 0
                ? styles.statusPillEmpty
                : item.isActive
                ? styles.statusPillActive
                : styles.statusPillInactive,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                item.totalTransactionCount === 0
                  ? styles.statusDotEmpty
                  : item.isActive
                  ? styles.statusDotActive
                  : styles.statusDotInactive,
              ]}
            />
            <Text
              style={[
                styles.statusPillText,
                item.totalTransactionCount === 0
                  ? styles.statusPillEmptyText
                  : item.isActive
                  ? styles.statusPillActiveText
                  : styles.statusPillInactiveText,
              ]}
            >
              {item.totalTransactionCount === 0
                ? (language === 'hi' ? 'खाली' : 'Empty')
                : item.isActive
                ? (language === 'hi' ? 'सक्रिय' : 'Active')
                : (language === 'hi' ? 'सुस्त' : 'Inactive')}
            </Text>
          </View>
        </View>

        {/* Last Active Timestamp Strip */}
        <View style={styles.lastActiveRow}>
          <Ionicons name="time-outline" size={13} color={Colors.textSecondary} />
          <Text style={styles.lastActiveLabel}>
            {language === 'hi' ? 'आखिरी गतिविधि:' : 'Last Activity:'}
          </Text>
          <Text style={styles.lastActiveValue}>
            {formatRelativeActivity(item.lastActiveDate, language === 'hi' ? 'hi' : 'en')}
          </Text>
        </View>

        {/* 4 Counter Metrics Grid */}
        <View style={styles.metricsGrid}>
          {/* Customers */}
          <View style={styles.metricBox}>
            <View style={styles.metricIconTitle}>
              <Ionicons name="people-outline" size={14} color={Colors.primary} />
              <Text style={styles.metricTitle}>{language === 'hi' ? 'ग्राहक' : 'Cust'}</Text>
            </View>
            <Text style={styles.metricCount}>{item.customerCount}</Text>
          </View>

          {/* Villages */}
          <View style={styles.metricBox}>
            <View style={styles.metricIconTitle}>
              <Ionicons name="business-outline" size={14} color="#0D9488" />
              <Text style={styles.metricTitle}>{language === 'hi' ? 'गाँव' : 'Vill'}</Text>
            </View>
            <Text style={styles.metricCount}>{item.villageCount}</Text>
          </View>

          {/* Credit Sale entries */}
          <View style={[styles.metricBox, styles.metricBoxCredit]}>
            <View style={styles.metricIconTitle}>
              <Ionicons name="arrow-up-circle-outline" size={14} color={Colors.creditSale} />
              <Text style={[styles.metricTitle, { color: Colors.creditSaleText }]}>
                {language === 'hi' ? 'उधारी' : 'Credit'}
              </Text>
            </View>
            <Text style={[styles.metricCount, { color: Colors.creditSale }]}>
              {item.creditSaleCount}
            </Text>
          </View>

          {/* Payment entries */}
          <View style={[styles.metricBox, styles.metricBoxPayment]}>
            <View style={styles.metricIconTitle}>
              <Ionicons name="arrow-down-circle-outline" size={14} color={Colors.paymentReceived} />
              <Text style={[styles.metricTitle, { color: Colors.paymentReceivedText }]}>
                {language === 'hi' ? 'जमा' : 'Payment'}
              </Text>
            </View>
            <Text style={[styles.metricCount, { color: Colors.paymentReceived }]}>
              {item.paymentCount}
            </Text>
          </View>
        </View>

        {/* Bottom Totals & Switch Button */}
        <View style={styles.cardFooter}>
          <View style={styles.footerTotals}>
            <Text style={styles.totalTxText}>
              {language === 'hi' ? 'कुल लेन-देन: ' : 'Total Entries: '}
              <Text style={styles.boldText}>{item.totalTransactionCount}</Text>
            </Text>
            {item.totalOutstandingPaise > 0 && (
              <Text style={styles.outstandingText}>
                {language === 'hi' ? 'बाकी: ' : 'Due: '}
                <Text style={styles.boldDueText}>
                  {formatCurrency(item.totalOutstandingPaise)}
                </Text>
              </Text>
            )}
          </View>

          {isCurrent ? (
            <View style={styles.openedPill}>
              <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
              <Text style={styles.openedPillText}>
                {language === 'hi' ? 'वर्तमान दुकान' : 'Active Store'}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.switchBtn}
              onPress={() => handleSwitchStore(item.business)}
              disabled={isSwitching}
              activeOpacity={0.7}
            >
              {isSwitching ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.switchBtnText}>
                    {language === 'hi' ? 'दुकान खोलें' : 'Switch Store'}
                  </Text>
                  <Ionicons name="arrow-forward" size={13} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.screen}>
      <Header
        title={language === 'hi' ? 'स्टोर मॉनिटर' : 'Store Monitor'}
        subtitle={language === 'hi' ? 'सभी दुकानों की लाइव एक्टिविटी' : 'Live Store Activity & Counts'}
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity
            style={styles.refreshIconBtn}
            onPress={onRefresh}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="refresh" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />

      <View style={styles.container}>
        {/* Top Summary Banner */}
        <View style={styles.summaryBanner}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryCount}>{totalStores}</Text>
            <Text style={styles.summaryLabel}>{language === 'hi' ? 'कुल दुकानें' : 'Stores'}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryCount, { color: '#16A34A' }]}>{activeStores}</Text>
            <Text style={styles.summaryLabel}>{language === 'hi' ? 'सक्रिय (7 दिन)' : 'Active'}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryCount}>{totalSystemCustomers}</Text>
            <Text style={styles.summaryLabel}>{language === 'hi' ? 'कुल ग्राहक' : 'Customers'}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryCount}>{totalSystemTransactions}</Text>
            <Text style={styles.summaryLabel}>{language === 'hi' ? 'कुल लेन-देन' : 'Entries'}</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textSecondary} />
          <TextInput
            placeholder={
              language === 'hi'
                ? 'दुकान या दुकानदार के नाम से खोजें...'
                : 'Search store, owner or phone...'
            }
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            style={[
              styles.searchInput,
              Platform.OS === 'web' ? ({ outlineStyle: 'none', outline: 'none' } as any) : null,
            ]}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterTabsRow}>
          <TouchableOpacity
            style={[styles.filterTab, filter === 'ALL' && styles.filterTabActive]}
            onPress={() => setFilter('ALL')}
          >
            <Text style={[styles.filterTabText, filter === 'ALL' && styles.filterTabTextActive]}>
              {language === 'hi' ? 'सभी दुकानें' : 'All'} ({totalStores})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === 'ACTIVE' && styles.filterTabActive]}
            onPress={() => setFilter('ACTIVE')}
          >
            <Text style={[styles.filterTabText, filter === 'ACTIVE' && styles.filterTabTextActive]}>
              🟢 {language === 'hi' ? 'सक्रिय' : 'Active'} ({activeStores})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === 'INACTIVE' && styles.filterTabActive]}
            onPress={() => setFilter('INACTIVE')}
          >
            <Text style={[styles.filterTabText, filter === 'INACTIVE' && styles.filterTabTextActive]}>
              🟡 {language === 'hi' ? 'सुस्त / खाली' : 'Inactive'} ({totalStores - activeStores})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Main List */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>
              {language === 'hi'
                ? 'सभी दुकानों का डेटा एकत्रित किया जा रहा है...'
                : 'Aggregating store activity...'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredStats}
            keyExtractor={(item) => item.business.id}
            renderItem={renderStoreItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="storefront-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>
                  {language === 'hi' ? 'कोई दुकान नहीं मिली' : 'No Stores Found'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {language === 'hi'
                    ? 'खोज फ़िल्टर बदलकर दोबारा प्रयास करें।'
                    : 'Try changing your search or filter.'}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  refreshIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryCount: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  summaryLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    height: 42,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
    height: '100%',
  },
  filterTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  filterTab: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterTabActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterTabTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  listContent: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  storeCard: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  currentStoreCard: {
    borderColor: Colors.primary,
    backgroundColor: '#FAFCFF',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  storeIconBox: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeMainInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  storeName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  currentBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1E40AF',
  },
  ownerText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  emailText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  statusPillActive: {
    backgroundColor: '#DCFCE7',
  },
  statusPillInactive: {
    backgroundColor: '#FEF3C7',
  },
  statusPillEmpty: {
    backgroundColor: '#F1F5F9',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotActive: {
    backgroundColor: '#16A34A',
  },
  statusDotInactive: {
    backgroundColor: '#D97706',
  },
  statusDotEmpty: {
    backgroundColor: '#94A3B8',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusPillActiveText: {
    color: '#166534',
  },
  statusPillInactiveText: {
    color: '#92400E',
  },
  statusPillEmptyText: {
    color: '#64748B',
  },
  lastActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
  },
  lastActiveLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  lastActiveValue: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 6,
    marginTop: Spacing.sm,
  },
  metricBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.md,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricBoxCredit: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  metricBoxPayment: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  metricIconTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 2,
  },
  metricTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  metricCount: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  footerTotals: {
    flex: 1,
  },
  totalTxText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  boldText: {
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  outstandingText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  boldDueText: {
    fontWeight: '700',
    color: Colors.creditSale,
  },
  openedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  openedPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  switchBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.md,
  },
  emptySubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
});
