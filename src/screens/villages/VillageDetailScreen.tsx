import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { EmptyState } from '../../components/EmptyState';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { t } from '../../i18n';
import { formatCurrency } from '../../utils/money';
import { DataRepository } from '../../services/db';
import { PdfService } from '../../services/pdfService';
import { Customer, Village, VillageSummary } from '../../types';
import { confirmAction, showAlert } from '../../utils/dialog';
import { Ionicons } from '@expo/vector-icons';

export const VillageDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { business, language, refreshAllData, guardAction } = useApp();

  const villageSummary: VillageSummary = route.params?.villageSummary;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filterDuesOnly, setFilterDuesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'DUE' | 'NAME'>('DUE');
  const [exporting, setExporting] = useState(false);
  const [currentVillageName, setCurrentVillageName] = useState(villageSummary?.villageName || '');
  const [villageName, setVillageName] = useState(villageSummary?.villageName || '');
  const [modalVisible, setModalVisible] = useState(false);

  const loadCustomers = useCallback(async () => {
    if (!business || !villageSummary) return;
    const all = await DataRepository.getCustomers(business.id);
    const villageCusts = all.filter((c) => c.villageId === villageSummary.villageId);
    setCustomers(villageCusts);
  }, [business, villageSummary]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useFocusEffect(
    useCallback(() => {
      loadCustomers();
    }, [loadCustomers])
  );

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
          await loadCustomers();
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

  const displayedCustomers = useMemo(() => {
    let list = [...customers];
    if (filterDuesOnly) {
      list = list.filter((c) => (c.currentBalancePaise || 0) > 0);
    }
    list.sort((a, b) => {
      if (sortBy === 'DUE') {
        return (b.currentBalancePaise || 0) - (a.currentBalancePaise || 0);
      }
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [customers, filterDuesOnly, sortBy]);

  const handleExportVillagePdf = async () => {
    if (!business || exporting) return;
    setExporting(true);
    try {
      const uri = await PdfService.generateVillageReportPdf(
        business,
        [villageSummary],
        villageSummary.totalOutstandingPaise
      );
      await PdfService.sharePdf(uri, undefined, `${villageSummary.villageName} Report`);
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

  const handleSaveVillage = async () => {
    if (!villageName.trim() || !business || !villageSummary) return;

    const v: Village = {
      id: villageSummary.villageId,
      businessId: business.id,
      name: villageName.trim(),
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await DataRepository.saveVillage(v);
    if (!res.success) {
      Alert.alert(t('error', language), res.error || t('duplicateVillageWarning', language));
      return;
    }

    setCurrentVillageName(villageName.trim());
    setModalVisible(false);
    await refreshAllData();
    Alert.alert(t('success', language), t('villageUpdatedSuccess', language));
  };

  const handleDeleteVillage = async () => {
    if (!business || !villageSummary) return;

    // Prevent deletion if transactions exist for customers in this village
    const allTxs = await DataRepository.getTransactions(business.id);
    const allCusts = await DataRepository.getCustomers(business.id);
    const villageCustIds = new Set(
      allCusts.filter((c) => c.villageId === villageSummary.villageId).map((c) => c.id)
    );
    const matchingTxs = allTxs.filter(
      (t) =>
        (t.customerId && villageCustIds.has(t.customerId)) ||
        t.villageName === currentVillageName
    );

    if (matchingTxs.length > 0) {
      const msg =
        language === 'hi'
          ? `गाँव "${currentVillageName}" में ${villageCustIds.size} ग्राहक और ${matchingTxs.length} लेन-देन दर्ज हैं।\n\nखाता-बही की सुरक्षा के लिए, सक्रिय लेन-देन वाले गाँव को नहीं हटाया जा सकता।\n\nकृपया पहले संबंधित लेन-देन हटाएं या ग्राहकों का गाँव बदलें।`
          : `Village "${currentVillageName}" has ${villageCustIds.size} customer(s) with ${matchingTxs.length} recorded transaction(s).\n\nTo preserve accounting records, villages with active transactions cannot be deleted.\n\nPlease delete or reassign all related transactions first.`;
      showAlert(t('cannotDeleteVillageTitle', language), msg, undefined, 'danger');
      return;
    }

    const confirmMsg =
      language === 'hi'
        ? `क्या आप सचमुच गाँव "${currentVillageName}" को हटाना चाहते हैं?`
        : `Are you sure you want to delete village "${currentVillageName}"?`;

    confirmAction(
      t('deleteVillage', language),
      confirmMsg,
      async () => {
        const res = await DataRepository.deleteVillage(business.id, villageSummary.villageId);
        if (res.success) {
          await refreshAllData();
          navigation.goBack();
          const successMsg =
            language === 'hi'
              ? `गाँव "${currentVillageName}" सफलतापूर्वक हटा दिया गया।`
              : `Village "${currentVillageName}" deleted successfully.`;
          showAlert(t('success', language), successMsg, undefined, 'success');
        } else if (res.error === 'HAS_TRANSACTIONS') {
          showAlert(
            t('cannotDeleteVillageTitle', language),
            t('cannotDeleteVillageHasTx', language),
            undefined,
            'danger'
          );
        } else {
          showAlert(t('error', language), res.error || 'Failed to delete village', undefined, 'danger');
        }
      },
      t('delete', language),
      t('cancel', language),
      'danger'
    );
  };

  return (
    <View style={styles.screen}>
      <Header
        title={currentVillageName || t('village', language)}
        subtitle={`${customers.length} ${t('villageCustomersSubtitle', language)}`}
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <View style={styles.headerActionsRow}>
            <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.iconBtn}>
              <Ionicons name="pencil" size={17} color={Colors.textInverse} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDeleteVillage} style={[styles.iconBtn, styles.deleteIconBtn]}>
              <Ionicons name="trash-outline" size={17} color={Colors.textInverse} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleExportVillagePdf} style={styles.iconBtn}>
              <Ionicons name="share-outline" size={17} color={Colors.textInverse} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Summary Box */}
      <Card style={styles.summaryCard}>
        <View style={styles.summaryTopRow}>
          <View>
            <Text style={styles.summaryLabel}>{t('currentOutstanding', language)}</Text>
            <Text style={styles.summaryAmount}>
              {formatCurrency(villageSummary?.totalOutstandingPaise || 0)}
            </Text>
          </View>
          <Badge
            label={`${villageSummary?.customersWithDueCount || 0} ${t('withDuesCountLabel', language)}`}
            variant="danger"
            size="md"
          />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>{t('totalUdhaarGiven', language)}</Text>
            <Text style={[styles.statVal, { color: Colors.creditSale }]}>
              {formatCurrency(villageSummary?.totalCreditPaise || 0)}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>{t('totalJamaReceived', language)}</Text>
            <Text style={[styles.statVal, { color: Colors.paymentReceived }]}>
              {formatCurrency(villageSummary?.totalPaymentPaise || 0)}
            </Text>
          </View>
        </View>
      </Card>

      {/* Filter and Sort controls */}
      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={[styles.filterChip, filterDuesOnly && styles.activeFilterChip]}
          onPress={() => setFilterDuesOnly(!filterDuesOnly)}
        >
          <Text style={[styles.filterText, filterDuesOnly && styles.activeFilterText]}>
            {filterDuesOnly ? `✓ ${t('onlyWithDuesFilter', language)}` : t('onlyWithDuesFilter', language)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sortBtn}
          onPress={() => setSortBy(sortBy === 'DUE' ? 'NAME' : 'DUE')}
        >
          <Ionicons name="swap-vertical" size={16} color={Colors.primary} />
          <Text style={styles.sortText}>
            {sortBy === 'DUE' ? t('sortByHighestDue', language) : t('sortByNameAZ', language)}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Customer List in Village */}
      <FlatList
        data={displayedCustomers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isDue = (item.currentBalancePaise || 0) > 0;
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation.navigate('CustomerLedger', { customer: item })}
            >
              <Card style={styles.customerRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
                </View>

                <View style={styles.customerInfo}>
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
                  <Text style={styles.customerMobile}>{item.mobile}</Text>
                </View>

                <View style={styles.dueCol}>
                  <Text
                    style={[
                      styles.dueAmount,
                      isDue ? { color: Colors.creditSale } : { color: Colors.paymentReceived },
                    ]}
                  >
                    {formatCurrency(item.currentBalancePaise || 0)}
                  </Text>
                  <Badge
                    label={isDue ? t('statusDue', language) : t('statusSettled', language)}
                    variant={isDue ? 'danger' : 'success'}
                    size="sm"
                  />
                </View>
              </Card>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title={t('noCustomersInVillage', language)}
            description={t('addCustomerPrompt', language)}
            actionTitle={t('addCustomer', language)}
            onAction={() => navigation.navigate('AddCustomer')}
          />
        }
      />

      {/* Edit Village Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('editVillage', language)}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Input
              label={t('villageName', language)}
              value={villageName}
              onChangeText={setVillageName}
              autoFocus
            />

            <Button
              title={t('save', language)}
              onPress={handleSaveVillage}
              variant="primary"
              size="md"
              style={{ marginTop: Spacing.sm }}
            />

            <Button
              title={t('deleteVillage', language)}
              variant="danger"
              size="md"
              icon={<Ionicons name="trash-outline" size={16} color="#FFFFFF" />}
              onPress={() => {
                setModalVisible(false);
                handleDeleteVillage();
              }}
              style={{ marginTop: Spacing.sm }}
            />
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
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteIconBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.4)',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  iconBtn: {
    padding: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  summaryCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  summaryAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  statBox: {
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: '#94A3B8',
  },
  statVal: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activeFilterChip: {
    backgroundColor: Colors.creditSaleLight,
    borderColor: Colors.creditSale,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activeFilterText: {
    color: Colors.creditSaleText,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
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
    paddingBottom: 40,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  customerInfo: {
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
  customerMobile: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  dueCol: {
    alignItems: 'flex-end',
  },
  dueAmount: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
});
