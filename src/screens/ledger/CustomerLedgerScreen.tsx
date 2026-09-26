import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  RefreshControl,
  Modal,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { LedgerRow } from '../../components/LedgerRow';
import { EmptyState } from '../../components/EmptyState';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { t } from '../../i18n';
import { formatCurrency } from '../../utils/money';
import { formatDisplayDate, formatUpperDate } from '../../utils/date';
import { DataRepository } from '../../services/db';
import { computeLedgerWithRunningBalances, calculateCustomerDueDate } from '../../services/accounting';
import { PdfService } from '../../services/pdfService';
import { ReminderService } from '../../services/reminderService';
import { Customer, Transaction } from '../../types';
import { confirmAction } from '../../utils/dialog';
import { Ionicons } from '@expo/vector-icons';

export const CustomerLedgerScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { business, language, refreshAllData, guardAction } = useApp();

  const customerParam: Customer = route.params?.customer;
  const [customer, setCustomer] = useState<Customer>(customerParam);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [searchItem, setSearchItem] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [txModalVisible, setTxModalVisible] = useState(false);

  const loadLedger = useCallback(async () => {
    if (!business || !customerParam) return;
    const [txs, allCusts] = await Promise.all([
      DataRepository.getTransactions(business.id, customerParam.id),
      DataRepository.getCustomers(business.id),
    ]);
    setTransactions(txs);

    const updatedCust = allCusts.find((c) => c.id === customerParam.id);
    if (updatedCust) {
      const activeDueDate = updatedCust.dueDate || calculateCustomerDueDate(txs, updatedCust.currentBalancePaise || 0);
      setCustomer({ ...updatedCust, dueDate: activeDueDate });
    }
  }, [business, customerParam]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  useFocusEffect(
    useCallback(() => {
      loadLedger();
    }, [loadLedger])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAllData();
    await loadLedger();
    setRefreshing(false);
  };

  const ledgerWithRunningBalances = useMemo(() => {
    const calculatedLedger = computeLedgerWithRunningBalances(
      customer.openingBalancePaise,
      transactions
    );

    if (!searchItem.trim()) {
      return calculatedLedger;
    }

    const q = searchItem.toLowerCase().trim();
    return calculatedLedger.filter(
      (tx) =>
        tx.description.toLowerCase().includes(q) ||
        (tx.referenceNumber && tx.referenceNumber.toLowerCase().includes(q))
    );
  }, [customer.openingBalancePaise, transactions, searchItem]);

  const handleExportPdf = async () => {
    if (!business || exportingPdf) return;
    setExportingPdf(true);
    try {
      const uri = await PdfService.generateCustomerLedgerPdf(
        business,
        customer,
        transactions
      );
      await PdfService.sharePdf(uri, undefined, `${customer.name} - Statement`);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (
        !msg.includes('canceled') &&
        !msg.includes('cancelled') &&
        !msg.includes('rejected') &&
        !msg.includes('dismissed')
      ) {
        Alert.alert(t('error', language), msg || 'Error generating PDF');
      }
    } finally {
      setTimeout(() => setExportingPdf(false), 700);
    }
  };

  const handleSendReminder = async () => {
    if (!business) return;
    const msg = ReminderService.generateReminderMessage(business, customer, language);
    await ReminderService.sendViaWhatsApp(customer.mobile, msg);
  };

  const handleExportCsv = async () => {
    try {
      await PdfService.exportTransactionsCsv(customer.name, transactions);
    } catch (err: any) {
      Alert.alert(t('error', language), err.message);
    }
  };

  const handleOpenTx = useCallback((item: Transaction) => {
    setSelectedTx(item);
    setTxModalVisible(true);
  }, []);

  const renderTransactionRow = useCallback(
    ({ item }: { item: any }) => (
      <LedgerRow transaction={item} onPress={() => handleOpenTx(item)} />
    ),
    [handleOpenTx]
  );

  const keyExtractor = useCallback((item: Transaction) => item.id, []);

  const handleEditTx = () => {
    if (!selectedTx) return;
    const txToEdit = selectedTx;
    guardAction(() => {
      setTxModalVisible(false);
      navigation.navigate('AddEntry', {
        customer,
        editingTransaction: txToEdit,
        initialMode: txToEdit.type === 'CREDIT_SALE' ? 'CREDIT' : 'PAYMENT',
      });
    });
  };

  const handleDeleteTx = () => {
    if (!selectedTx || !business) return;
    const txToDelete = selectedTx;
    guardAction(() => {
      confirmAction(
        t('deleteEntry', language),
        `${txToDelete.description} (${formatCurrency(txToDelete.amountPaise)})\n\n${t('deleteEntryConfirm', language)}`,
        async () => {
          const res = await DataRepository.deleteTransaction(business.id, txToDelete.id);
          if (res.success) {
            setTxModalVisible(false);
            setSelectedTx(null);
            await refreshAllData();
            await loadLedger();
            if (Platform.OS === 'web') {
              window.alert(t('entryDeletedSuccess', language));
            } else {
              Alert.alert(t('success', language), t('entryDeletedSuccess', language));
            }
          } else {
            const errMsg = res.error || 'Failed to delete transaction';
            if (Platform.OS === 'web') {
              window.alert(errMsg);
            } else {
              Alert.alert(t('error', language), errMsg);
            }
          }
        },
        t('delete', language),
        t('cancel', language)
      );
    });
  };

  const handleDeleteCustomer = async () => {
    if (!customer || !business) return;
    try {
      if (transactions.length > 0) {
        const msg =
          language === 'hi'
            ? `"${customer.name}" के खाते में ${transactions.length} लेन-देन दर्ज हैं।\n\nखाता-बही की सुरक्षा के लिए, जब तक लेन-देन मौजूद हैं ग्राहक को हटाया नहीं जा सकता।\n\nकृपया पहले खाता-बही से सभी लेन-देन हटाएं।`
            : `"${customer.name}" has ${transactions.length} recorded transaction(s).\n\nTo preserve accounting accuracy, customers with transaction history cannot be deleted.\n\nPlease delete all transactions from the customer ledger first.`;
        if (Platform.OS === 'web') {
          window.alert(`${t('cannotDeleteCustomerTitle', language)}\n\n${msg}`);
        } else {
          Alert.alert(t('cannotDeleteCustomerTitle', language), msg);
        }
        return;
      }

      const confirmMsg =
        language === 'hi'
          ? `क्या आप सचमुच ग्राहक "${customer.name}" को हटाना चाहते हैं?`
          : `Are you sure you want to delete customer "${customer.name}"?`;

      confirmAction(
        t('deleteCustomer', language),
        confirmMsg,
        async () => {
          const res = await DataRepository.deleteCustomer(business.id, customer.id);
          await refreshAllData();
          if (res.success) {
            const successMsg =
              language === 'hi'
                ? `ग्राहक "${customer.name}" सफलतापूर्वक हटा दिया गया।`
                : `Customer "${customer.name}" deleted successfully.`;
            if (Platform.OS === 'web') {
              window.alert(successMsg);
              navigation.goBack();
            } else {
              Alert.alert(t('success', language), successMsg, [
                {
                  text: t('ok', language),
                  onPress: () => navigation.goBack(),
                },
              ]);
            }
          } else if (res.error === 'HAS_TRANSACTIONS') {
            const hasTxMsg = `${t('cannotDeleteCustomerTitle', language)}\n\n${t('cannotDeleteCustomerHasTx', language)}`;
            if (Platform.OS === 'web') {
              window.alert(hasTxMsg);
            } else {
              Alert.alert(t('cannotDeleteCustomerTitle', language), t('cannotDeleteCustomerHasTx', language));
            }
          } else {
            const errMsg = res.error || 'Failed to delete customer';
            if (Platform.OS === 'web') {
              window.alert(errMsg);
            } else {
              Alert.alert(t('error', language), errMsg);
            }
          }
        },
        t('delete', language),
        t('cancel', language)
      );
    } catch (err: any) {
      if (Platform.OS === 'web') {
        window.alert(err.message || 'Error deleting customer');
      } else {
        Alert.alert(t('error', language), err.message || 'Error deleting customer');
      }
    }
  };

  const isDue = (customer.currentBalancePaise || 0) > 0;
  const isAdvance = (customer.currentBalancePaise || 0) < 0;

  return (
    <View style={styles.screen}>
      <Header
        title={customer.name}
        subtitle={`${customer.villageName || t('noVillageRecorded', language)} • ${customer.mobile}`}
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              onPress={() => navigation.navigate('EditCustomer', { customer })}
              style={styles.iconBtn}
              accessibilityLabel={t('editCustomer', language)}
            >
              <Ionicons name="pencil" size={18} color={Colors.textInverse} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => guardAction(handleDeleteCustomer)}
              style={styles.iconBtn}
              accessibilityLabel={t('deleteCustomer', language)}
            >
              <Ionicons name="trash-outline" size={18} color={Colors.textInverse} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleExportPdf} style={styles.iconBtn} disabled={exportingPdf}>
              <Ionicons name="document-text-outline" size={20} color={Colors.textInverse} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSendReminder} style={styles.iconBtn}>
              <Ionicons name="logo-whatsapp" size={20} color="#4ADE80" />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Account Of Ledger Header Card */}
      <View style={styles.headerWrapper}>
        <Card style={styles.ledgerHeaderCard}>
          <View style={styles.accountTitleRow}>
            <View style={{ flex: 1, marginRight: Spacing.sm }}>
              <Text style={styles.accountOfLabel}>{t('accountOf', language)}</Text>
              <Text style={styles.accountOfValue}>
                {customer.name} • <Text style={styles.villageHighlight}>{customer.villageName || '-'}</Text>
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Badge
                label={
                  isDue
                    ? t('statusDue', language)
                    : isAdvance
                    ? t('statusAdvance', language)
                    : t('statusSettled', language)
                }
                variant={isDue ? 'danger' : isAdvance ? 'info' : 'success'}
                size="md"
              />
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <TouchableOpacity
                  style={styles.editCustomerBadgeBtn}
                  onPress={() => guardAction(() => navigation.navigate('EditCustomer', { customer }))}
                >
                  <Ionicons name="pencil" size={12} color={Colors.primary} />
                  <Text style={styles.editCustomerBadgeText}>{t('editCustomerDetails', language)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteCustomerBadgeBtn}
                  onPress={() => guardAction(handleDeleteCustomer)}
                >
                  <Ionicons name="trash-outline" size={12} color={Colors.danger} />
                  <Text style={styles.deleteCustomerBadgeText}>{t('delete', language)}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Active Payment Due Date Banner if due */}
          {customer.dueDate && isDue ? (
            <View style={styles.ledgerDueDateBanner}>
              <Ionicons name="calendar" size={14} color="#B45309" />
              <Text style={styles.ledgerDueDateText}>
                {t('paymentDueDate', language)}: <Text style={{ fontWeight: '800', color: '#92400E' }}>{formatUpperDate(customer.dueDate)}</Text>
              </Text>
            </View>
          ) : null}

          {/* 4-Box Summary Grid: Opening, Total Udhaar, Total Jama, Net Outstanding */}
          <View style={styles.summaryGrid}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryBoxLabel}>{t('openingBalance', language)}</Text>
              <Text style={styles.summaryBoxVal}>
                {formatCurrency(customer.openingBalancePaise)}
              </Text>
            </View>

            <View style={styles.summaryBox}>
              <Text style={styles.summaryBoxLabel}>{t('totalUdhaarGiven', language)}</Text>
              <Text style={[styles.summaryBoxVal, { color: Colors.creditSale }]}>
                {formatCurrency(customer.totalCreditPaise || 0)}
              </Text>
            </View>

            <View style={styles.summaryBox}>
              <Text style={styles.summaryBoxLabel}>{t('totalJamaReceived', language)}</Text>
              <Text style={[styles.summaryBoxVal, { color: Colors.paymentReceived }]}>
                {formatCurrency(customer.totalPaymentPaise || 0)}
              </Text>
            </View>

            <View style={[styles.summaryBox, styles.netBox]}>
              <Text style={[styles.summaryBoxLabel, { fontWeight: '700' }]}>{t('netRemainingDue', language)}</Text>
              <Text
                style={[
                  styles.summaryBoxVal,
                  styles.netAmount,
                  isDue ? styles.dueText : isAdvance ? styles.advanceText : styles.zeroText,
                ]}
              >
                {formatCurrency(customer.currentBalancePaise)}
              </Text>
            </View>
          </View>
        </Card>
      </View>

      {/* Action shortcuts row: PDF, WhatsApp, CSV */}
      <View style={styles.actionShortcutsRow}>
        <TouchableOpacity style={styles.shortcutBtn} onPress={handleExportPdf} disabled={exportingPdf}>
          <Ionicons name="document-text-outline" size={15} color={Colors.primary} />
          <Text style={styles.shortcutText}>{t('statementPdf', language)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.shortcutBtn} onPress={handleSendReminder}>
          <Ionicons name="logo-whatsapp" size={15} color="#16A34A" />
          <Text style={styles.shortcutText}>{t('sendWhatsAppReminder', language)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.shortcutBtn} onPress={handleExportCsv}>
          <Ionicons name="download-outline" size={15} color={Colors.textSecondary} />
          <Text style={styles.shortcutText}>{t('exportCsv', language)}</Text>
        </TouchableOpacity>
      </View>

      {/* Particulars Search Input */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={Colors.textSecondary} />
        <TextInput
          placeholder={t('searchLedgerPlaceholder', language)}
          placeholderTextColor={Colors.textMuted}
          value={searchItem}
          onChangeText={setSearchItem}
          style={styles.searchInput}
        />
        {searchItem ? (
          <TouchableOpacity onPress={() => setSearchItem('')}>
            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Ledger Table Column Headers */}
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHead, { width: 82 }]}>{t('tableHeadDate', language)}</Text>
        <Text style={[styles.tableHead, { flex: 1, paddingHorizontal: 6 }]}>{t('tableHeadItem', language)}</Text>
        <Text style={[styles.tableHead, { minWidth: 100, textAlign: 'right' }]}>{t('tableHeadAmounts', language)}</Text>
      </View>

      {/* Ledger Transaction Timeline */}
      <FlatList
        data={ledgerWithRunningBalances}
        keyExtractor={keyExtractor}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        contentContainerStyle={styles.listContent}
        renderItem={renderTransactionRow}
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== 'web'}
        ListEmptyComponent={
          <EmptyState
            icon="journal-outline"
            title={t('noTransactionsInLedger', language)}
            description={t('addFirstTransactionPrompt', language)}
          />
        }
      />

      {/* Bottom Sticky Action Buttons */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.bottomBtn, styles.giveCreditBtn]}
          activeOpacity={0.85}
          onPress={() => guardAction(() => navigation.navigate('AddEntry', { customer, initialMode: 'CREDIT' }))}
        >
          <Ionicons name="add-circle-outline" size={20} color={Colors.textInverse} />
          <Text style={styles.bottomBtnText}>Add Entry</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bottomBtn, styles.receivePaymentBtn]}
          activeOpacity={0.85}
          onPress={() => guardAction(() => navigation.navigate('AddEntry', { customer, initialMode: 'PAYMENT' }))}
        >
          <Ionicons name="checkmark-circle-outline" size={20} color={Colors.textInverse} />
          <Text style={styles.bottomBtnText}>{t('receivePayment', language)}</Text>
        </TouchableOpacity>
      </View>

      {/* Transaction Details & Action Modal */}
      <Modal
        visible={txModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTxModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.txModalContent}>
            {selectedTx && (
              <>
                {/* Modal Header */}
                <View style={styles.txModalHeader}>
                  <View style={styles.txTypeBadgeRow}>
                    <Badge
                      label={
                        selectedTx.type === 'CREDIT_SALE'
                          ? (language === 'hi' ? 'उधार (+)' : 'Credit / Udhaar (+)')
                          : (language === 'hi' ? 'जमा (-)' : 'Payment / Jama (-)')
                      }
                      variant={selectedTx.type === 'CREDIT_SALE' ? 'danger' : 'success'}
                      size="md"
                    />
                    <Text style={styles.txModalDateText}>{formatDisplayDate(selectedTx.date)}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setTxModalVisible(false)}
                    style={styles.modalCloseBtn}
                  >
                    <Ionicons name="close" size={22} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {/* Amount Banner */}
                <View style={styles.txAmountBanner}>
                  <Text
                    style={[
                      styles.txBannerAmount,
                      { color: selectedTx.type === 'CREDIT_SALE' ? Colors.creditSale : Colors.paymentReceived },
                    ]}
                  >
                    {selectedTx.type === 'CREDIT_SALE' ? '+' : '-'} {formatCurrency(selectedTx.amountPaise)}
                  </Text>
                  {selectedTx.discountPaise ? (
                    <View style={styles.txDiscountPill}>
                      <Text style={styles.txDiscountPillText}>
                        {t('discountBadge', language)}: {formatCurrency(selectedTx.discountPaise)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Details Breakdown */}
                <View style={styles.txDetailList}>
                  <View style={styles.txDetailRow}>
                    <Text style={styles.txDetailLabel}>{t('particulars', language)}</Text>
                    <Text style={styles.txDetailValue}>{selectedTx.description}</Text>
                  </View>

                  {selectedTx.quantity ? (
                    <View style={styles.txDetailRow}>
                      <Text style={styles.txDetailLabel}>{t('quantity', language)} / {t('ratePerUnit', language)}</Text>
                      <Text style={styles.txDetailValue}>
                        {selectedTx.quantity} {selectedTx.unit || ''} @ {formatCurrency(selectedTx.ratePaise || 0)}
                      </Text>
                    </View>
                  ) : null}

                  {selectedTx.dueDate ? (
                    <View style={styles.txDetailRow}>
                      <Text style={styles.txDetailLabel}>{t('paymentDueDate', language)}</Text>
                      <Text style={[styles.txDetailValue, { color: Colors.primary, fontWeight: '700' }]}>
                        {formatUpperDate(selectedTx.dueDate)}
                      </Text>
                    </View>
                  ) : null}

                  {selectedTx.paymentMethod ? (
                    <View style={styles.txDetailRow}>
                      <Text style={styles.txDetailLabel}>{t('paymentMethodLabel', language)}</Text>
                      <Text style={styles.txDetailValue}>{selectedTx.paymentMethod}</Text>
                    </View>
                  ) : null}

                  {selectedTx.referenceNumber ? (
                    <View style={styles.txDetailRow}>
                      <Text style={styles.txDetailLabel}>{t('cbFolio', language)}</Text>
                      <Text style={styles.txDetailValue}>{selectedTx.referenceNumber}</Text>
                    </View>
                  ) : null}

                  {selectedTx.notes ? (
                    <View style={styles.txDetailRow}>
                      <Text style={styles.txDetailLabel}>{t('notes', language)}</Text>
                      <Text style={styles.txDetailValue}>{selectedTx.notes}</Text>
                    </View>
                  ) : null}

                  <View style={[styles.txDetailRow, styles.txBalanceRow]}>
                    <Text style={styles.txBalanceLabel}>{t('balance', language)}</Text>
                    <Text style={styles.txBalanceValue}>
                      {formatCurrency(selectedTx.runningBalancePaise || 0)}
                    </Text>
                  </View>
                </View>

                {/* Action Buttons: Edit and Delete */}
                <View style={styles.txActionsRow}>
                  <TouchableOpacity
                    style={[styles.txActionButton, styles.txEditBtn]}
                    onPress={handleEditTx}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="pencil" size={18} color="#FFFFFF" />
                    <Text style={styles.txActionBtnText}>{t('editEntry', language)}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.txActionButton, styles.txDeleteBtn]}
                    onPress={handleDeleteTx}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.txActionBtnText}>{t('deleteEntry', language)}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
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
  iconBtn: {
    padding: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerWrapper: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  ledgerHeaderCard: {
    padding: Spacing.md,
    marginBottom: Spacing.xs,
  },
  accountTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  accountOfLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  accountOfValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  villageHighlight: {
    color: Colors.primary,
  },
  editCustomerBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  editCustomerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  deleteCustomerBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  deleteCustomerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.danger,
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  summaryBox: {
    flex: 1,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    paddingHorizontal: 2,
  },
  ledgerDueDateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    marginTop: Spacing.sm,
  },
  ledgerDueDateText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
  },
  netBox: {
    borderRightWidth: 0,
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.sm,
  },
  summaryBoxLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  summaryBoxVal: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  netAmount: {
    fontSize: 14,
    fontWeight: '800',
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
  actionShortcutsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  shortcutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: 7,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 5,
  },
  shortcutText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.lg,
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
    marginLeft: Spacing.sm,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    marginTop: 4,
  },
  tableHead: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  listContent: {
    paddingBottom: 90,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.md,
    elevation: 8,
  },
  bottomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  giveCreditBtn: {
    backgroundColor: Colors.creditSale,
  },
  receivePaymentBtn: {
    backgroundColor: Colors.paymentReceived,
  },
  bottomBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  txModalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
    maxHeight: '85%',
  },
  txModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  txTypeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  txModalDateText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: '#F1F5F9',
  },
  txAmountBanner: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  txBannerAmount: {
    fontSize: 28,
    fontWeight: '800',
  },
  txDiscountPill: {
    marginTop: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  txDiscountPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  txDetailList: {
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  txDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  txDetailLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  txDetailValue: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '600',
    maxWidth: '65%',
    textAlign: 'right',
  },
  txBalanceRow: {
    borderBottomWidth: 0,
    paddingTop: 8,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  txBalanceLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  txBalanceValue: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primary,
  },
  txActionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  txActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  txEditBtn: {
    backgroundColor: Colors.primary,
  },
  txDeleteBtn: {
    backgroundColor: Colors.creditSale,
  },
  txActionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
