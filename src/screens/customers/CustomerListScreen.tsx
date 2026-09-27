import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { t } from '../../i18n';
import { formatCurrency } from '../../utils/money';
import { DataRepository } from '../../services/db';
import { Customer } from '../../types';
import { confirmAction, showAlert } from '../../utils/dialog';
import { Ionicons } from '@expo/vector-icons';

type FilterTab = 'ALL' | 'WITH_DUES' | 'ZERO_DUE';
type SortOption = 'HIGHEST_DUE' | 'NAME';

export const CustomerListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { business, language, guardAction, refreshAllData, dataVersion } = useApp();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('HIGHEST_DUE');
  const [refreshing, setRefreshing] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const loadData = useCallback(async () => {
    if (!business) return;
    const cList = await DataRepository.getCustomers(business.id);
    setCustomers(cList);
  }, [business]);

  useEffect(() => {
    loadData();
  }, [loadData, dataVersion]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleDeleteCustomer = async (cust: Customer) => {
    if (!business) return;
    try {
      const txs = await DataRepository.getTransactions(business.id, cust.id);
      if (txs.length > 0) {
        const msg =
          language === 'hi'
            ? `"${cust.name}" के खाते में ${txs.length} लेन-देन दर्ज हैं।\n\nखाता-बही की सुरक्षा के लिए, जब तक लेन-देन मौजूद हैं ग्राहक को हटाया नहीं जा सकता।\n\nकृपया पहले खाता-बही से सभी लेन-देन हटाएं।`
            : `"${cust.name}" has ${txs.length} recorded transaction(s).\n\nTo preserve accounting accuracy, customers with transaction history cannot be deleted.\n\nPlease delete all transactions from the customer ledger first.`;
        showAlert(t('cannotDeleteCustomerTitle', language), msg, undefined, 'danger');
        return;
      }

      const confirmMsg =
        language === 'hi'
          ? `क्या आप सचमुच ग्राहक "${cust.name}" को हटाना चाहते हैं?`
          : `Are you sure you want to delete customer "${cust.name}"?`;

      confirmAction(
        t('deleteCustomer', language),
        confirmMsg,
        async () => {
          const res = await DataRepository.deleteCustomer(business.id, cust.id);
          await refreshAllData();
          await loadData();
          if (res.success) {
            const successMsg =
              language === 'hi'
                ? `ग्राहक "${cust.name}" सफलतापूर्वक हटा दिया गया।`
                : `Customer "${cust.name}" deleted successfully.`;
            showAlert(t('success', language), successMsg, undefined, 'success');
          } else if (res.error === 'HAS_TRANSACTIONS') {
            showAlert(t('cannotDeleteCustomerTitle', language), t('cannotDeleteCustomerHasTx', language), undefined, 'danger');
          } else {
            showAlert(t('error', language), res.error || 'Failed to delete customer', undefined, 'danger');
          }
        },
        t('delete', language),
        t('cancel', language),
        'danger'
      );
    } catch (err: any) {
      showAlert(t('error', language), err.message || 'Error checking customer transactions', undefined, 'danger');
    }
  };

  const filteredCustomers = useMemo(() => {
    let list = [...customers].filter((c) => c.status !== 'INACTIVE');

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.mobile.includes(q) ||
          (c.villageName && c.villageName.toLowerCase().includes(q))
      );
    }

    if (filterTab === 'WITH_DUES') {
      list = list.filter((c) => (c.currentBalancePaise || 0) > 0);
    } else if (filterTab === 'ZERO_DUE') {
      list = list.filter((c) => (c.currentBalancePaise || 0) <= 0);
    }

    list.sort((a, b) => {
      if (sortBy === 'HIGHEST_DUE') {
        return (b.currentBalancePaise || 0) - (a.currentBalancePaise || 0);
      } else {
        return a.name.localeCompare(b.name);
      }
    });

    return list;
  }, [customers, search, filterTab, sortBy]);

  const renderCustomerItem = useCallback(
    ({ item }: { item: Customer }) => {
      const isDue = (item.currentBalancePaise || 0) > 0;
      const isAdvance = (item.currentBalancePaise || 0) < 0;

      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.navigate('CustomerLedger', { customer: item })}
        >
          <Card style={styles.customerCard}>
            <View style={styles.cardHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
              </View>

              <View style={styles.customerDetails}>
                <View style={styles.nameRow}>
                  <Text style={styles.customerName}>{item.name}</Text>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      guardAction(() => navigation.navigate('EditCustomer', { customer: item }));
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.customerEditIconBtn}
                    accessibilityLabel={t('editCustomer', language)}
                  >
                    <Ionicons name="pencil" size={12} color={Colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      guardAction(() => handleDeleteCustomer(item));
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.customerDeleteIconBtn}
                    accessibilityLabel={t('deleteCustomer', language)}
                  >
                    <Ionicons name="trash-outline" size={12} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
                <View style={styles.metaRow}>
                  <Ionicons name="location-outline" size={13} color={Colors.textSecondary} />
                  <Text style={styles.metaText}>{item.villageName || t('noVillageRecorded', language)}</Text>
                  <Text style={styles.metaDivider}>•</Text>
                  <Ionicons name="call-outline" size={13} color={Colors.textSecondary} />
                  <Text style={styles.metaText}>{item.mobile}</Text>
                </View>
              </View>

              <View style={styles.balanceCol}>
                <Text
                  style={[
                    styles.balanceAmount,
                    isDue ? styles.dueText : isAdvance ? styles.advanceText : styles.zeroText,
                  ]}
                >
                  {formatCurrency(Math.abs(item.currentBalancePaise || 0))}
                </Text>
                <Badge
                  label={
                    isDue
                      ? t('statusDue', language)
                      : isAdvance
                      ? t('statusAdvance', language)
                      : t('statusSettled', language)
                  }
                  variant={isDue ? 'danger' : isAdvance ? 'info' : 'success'}
                  size="sm"
                />
              </View>
            </View>

            {/* Quick totals strip */}
            <View style={styles.totalsStrip}>
              <View style={styles.totalItem}>
                <Text style={styles.totalLabel}>{t('totalUdhaarGiven', language)}: </Text>
                <Text style={[styles.totalValue, { color: Colors.creditSale }]}>
                  {formatCurrency(item.totalCreditPaise || 0)}
                </Text>
              </View>
              <View style={styles.totalItem}>
                <Text style={styles.totalLabel}>{t('totalJamaReceived', language)}: </Text>
                <Text style={[styles.totalValue, { color: Colors.paymentReceived }]}>
                  {formatCurrency(item.totalPaymentPaise || 0)}
                </Text>
              </View>
              <View style={styles.totalItem}>
                <Text style={styles.totalLabel}>{t('transactions', language)}: </Text>
                <Text style={styles.totalValue}>{item.transactionCount || 0}</Text>
              </View>
            </View>
          </Card>
        </TouchableOpacity>
      );
    },
    [language, navigation]
  );

  const keyExtractor = useCallback((item: Customer) => item.id, []);

  return (
    <View style={styles.screen}>
      <Header
        title={t('customers', language)}
        subtitle={`${filteredCustomers.length} ${t('customers', language)}`}
        showBack
        onBack={() => navigation.navigate('DashboardTab')}
      />

      <View style={styles.container}>
        {/* Search Bar */}
        <View style={[styles.searchBar, searchFocused && styles.searchBarFocused]}>
          <Ionicons name="search" size={18} color={searchFocused ? Colors.primary : Colors.textSecondary} />
          <TextInput
            placeholder={t('searchCustomerPlaceholder', language)}
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            style={[
              styles.searchInput,
              Platform.OS === 'web' ? ({ outlineStyle: 'none', outline: 'none' } as any) : null,
            ]}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter Tabs */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabBtn, filterTab === 'ALL' && styles.activeTabBtn]}
            onPress={() => setFilterTab('ALL')}
          >
            <Text style={[styles.tabText, filterTab === 'ALL' && styles.activeTabText]}>
              {t('allCustomers', language)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, filterTab === 'WITH_DUES' && styles.activeTabBtn]}
            onPress={() => setFilterTab('WITH_DUES')}
          >
            <Text style={[styles.tabText, filterTab === 'WITH_DUES' && styles.activeTabText]}>
              {t('withDuesOnly', language)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, filterTab === 'ZERO_DUE' && styles.activeTabBtn]}
            onPress={() => setFilterTab('ZERO_DUE')}
          >
            <Text style={[styles.tabText, filterTab === 'ZERO_DUE' && styles.activeTabText]}>
              {t('zeroBalance', language)}
            </Text>
          </TouchableOpacity>

          {/* Sort toggle */}
          <TouchableOpacity
            style={styles.sortBtn}
            onPress={() => setSortBy(sortBy === 'HIGHEST_DUE' ? 'NAME' : 'HIGHEST_DUE')}
          >
            <Ionicons name="swap-vertical" size={16} color={Colors.primary} />
            <Text style={styles.sortText}>
              {sortBy === 'HIGHEST_DUE' ? t('sortByHighestDue', language) : t('sortByNameAZ', language)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Customer List */}
        <FlatList
          data={filteredCustomers}
          keyExtractor={keyExtractor}
          renderItem={renderCustomerItem}
          contentContainerStyle={styles.listContent}
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== 'web'}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title={t('noCustomersFound', language)}
              description={t('noCustomersFoundDesc', language)}
              actionTitle={t('addCustomer', language)}
              onAction={() => guardAction(() => navigation.navigate('AddCustomer'))}
            />
          }
        />
      </View>

      {/* Floating Add Customer Button */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => guardAction(() => navigation.navigate('AddCustomer'))}
      >
        <Ionicons name="person-add" size={24} color={Colors.textInverse} />
      </TouchableOpacity>
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    height: 44,
  },
  searchBarFocused: {
    borderColor: Colors.primary,
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    marginLeft: Spacing.sm,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  tabBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activeTabBtn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activeTabText: {
    color: Colors.textInverse,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    backgroundColor: Colors.primaryLight,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  sortText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  listContent: {
    padding: Spacing.lg,
    paddingBottom: 80,
  },
  customerCard: {
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
  },
  customerDetails: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customerEditIconBtn: {
    padding: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight,
  },
  customerDeleteIconBtn: {
    padding: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: '#FEE2E2',
  },
  customerName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 3,
  },
  metaText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  metaDivider: {
    color: Colors.borderDark,
    marginHorizontal: 2,
  },
  balanceCol: {
    alignItems: 'flex-end',
  },
  balanceAmount: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  dueText: {
    color: Colors.creditSale,
  },
  advanceText: {
    color: Colors.advanceBalance,
  },
  zeroText: {
    color: Colors.paymentReceived,
  },
  totalsStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.md,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
  },
  totalItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  totalValue: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
});
