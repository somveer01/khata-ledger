import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Header } from '../../components/Header';
import { DatePickerField } from '../../components/DatePickerField';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { t } from '../../i18n';
import { toPaise, toRupees, formatCurrency } from '../../utils/money';
import { getTodayIST, formatDisplayDate } from '../../utils/date';
import { DataRepository } from '../../services/db';
import { Customer, Transaction, PaymentMethod } from '../../types';
import { Ionicons } from '@expo/vector-icons';

export const ReceivePaymentScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { business, language, refreshAllData, dataVersion } = useApp();

  const preselectedCustomer: Customer | undefined = route.params?.customer;

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    preselectedCustomer || null
  );
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [searchCust, setSearchCust] = useState('');

  const [date, setDate] = useState(getTodayIST());
  const [amount, setAmount] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [refNumber, setRefNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [idempotencyKey] = useState(`idemp_pay_${Date.now()}_${Math.random().toString(36).substring(7)}`);

  const loadCustomers = useCallback(async () => {
    if (!business) return;
    const list = await DataRepository.getCustomers(business.id);
    const active = list.filter((c) => c.status !== 'INACTIVE');
    setCustomers(active);
    setSelectedCustomer((prev) => {
      if (prev) {
        return active.find((c) => c.id === prev.id) || (active.length > 0 ? active[0] : null);
      }
      if (preselectedCustomer) {
        return active.find((c) => c.id === preselectedCustomer.id) || (active.length > 0 ? active[0] : null);
      }
      const dueCust = active.find((c) => (c.currentBalancePaise || 0) > 0);
      return dueCust || (active.length > 0 ? active[0] : null);
    });
  }, [business, preselectedCustomer]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers, dataVersion]);

  useFocusEffect(
    useCallback(() => {
      loadCustomers();
    }, [loadCustomers])
  );

  const currentDuePaise = selectedCustomer?.currentBalancePaise || 0;
  const paymentAmountPaise = toPaise(amount || 0);
  const discountAmountPaise = toPaise(discountAmount || 0);
  const totalSettledPaise = paymentAmountPaise + discountAmountPaise;
  const remainingBalancePaise = currentDuePaise - totalSettledPaise;

  const setFullDueAmount = () => {
    if (currentDuePaise > 0) {
      setAmount(toRupees(currentDuePaise).toString());
      setDiscountAmount('');
    }
  };

  const handleSavePayment = async () => {
    if (!selectedCustomer) {
      Alert.alert(t('error', language), t('pleaseSelectCustomer', language));
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert(t('error', language), t('enterValidAmount', language));
      return;
    }

    setLoading(true);
    try {
      const tx: Transaction = {
        id: `tx_pay_${Date.now()}`,
        businessId: business!.id,
        customerId: selectedCustomer.id,
        type: 'PAYMENT',
        amountPaise: paymentAmountPaise,
        discountPaise: discountAmountPaise > 0 ? discountAmountPaise : undefined,
        description: discountAmountPaise > 0
          ? `${notes.trim() || (language === 'hi' ? 'भुगतान प्राप्त' : 'Payment Received')} (${t('discountBadge', language)}: ${formatCurrency(discountAmountPaise)})`
          : notes.trim() || (language === 'hi' ? 'भुगतान प्राप्त (जमा)' : 'Payment Received'),
        paymentMethod,
        referenceNumber: refNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        date,
        createdAt: new Date().toISOString(),
        idempotencyKey,
      };

      const result = await DataRepository.recordTransaction(tx);
      await refreshAllData();
      setLoading(false);

      if (result.success) {
        navigation.replace('Receipt', {
          customer: {
            ...selectedCustomer,
            currentBalancePaise: result.newBalancePaise,
          },
          transaction: result.transaction,
          previousBalancePaise: currentDuePaise,
        });
      } else {
        Alert.alert(t('error', language), result.error || 'Error recording payment');
      }
    } catch (err: any) {
      setLoading(false);
      Alert.alert(t('error', language), err.message);
    }
  };

  const methods: { id: PaymentMethod; labelKey: keyof typeof import('../../i18n').translations.en; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'CASH', labelKey: 'cash', icon: 'cash-outline' },
    { id: 'UPI', labelKey: 'upi', icon: 'qr-code-outline' },
    { id: 'BANK_TRANSFER', labelKey: 'bankTransfer', icon: 'business-outline' },
    { id: 'CHEQUE', labelKey: 'cheque', icon: 'document-text-outline' },
    { id: 'OTHER', labelKey: 'other', icon: 'ellipsis-horizontal-outline' },
  ];

  const filteredModalCusts = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchCust.toLowerCase()) ||
      c.mobile.includes(searchCust) ||
      (c.villageName && c.villageName.toLowerCase().includes(searchCust))
  );

  return (
    <View style={styles.screen}>
      <Header
        title={t('receivePayment', language)}
        subtitle={t('receivePaymentDesc', language)}
        showBack
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card>
          {/* Customer Selector */}
          <Text style={styles.label}>{t('customer', language)} *</Text>
          <TouchableOpacity
            style={styles.customerSelector}
            onPress={() => setCustomerModalVisible(true)}
          >
            <View style={styles.custAvatar}>
              <Text style={styles.avatarText}>{selectedCustomer?.name.charAt(0) || '?'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.custName}>{selectedCustomer?.name || t('selectCustomer', language)}</Text>
              <Text style={styles.custVillage}>
                {selectedCustomer?.villageName || '-'} • {t('statusDue', language)}:{' '}
                <Text style={{ color: Colors.creditSale, fontWeight: '700' }}>
                  {formatCurrency(currentDuePaise)}
                </Text>
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>

          {/* Current Outstanding Box */}
          <View style={styles.duePreviewBox}>
            <View>
              <Text style={styles.duePreviewLabel}>{t('currentTotalDueLabel', language)}:</Text>
              <Text style={styles.duePreviewVal}>{formatCurrency(currentDuePaise)}</Text>
            </View>
            {currentDuePaise > 0 && (
              <TouchableOpacity style={styles.fullPayChip} onPress={setFullDueAmount}>
                <Text style={styles.fullPayText}>{t('payFullDueBtn', language)}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Payment Amount */}
          <Input
            label={`${t('receivedAmountLabel', language)} *`}
            placeholder="0.00"
            prefix="₹"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            autoFocus={!preselectedCustomer}
            style={{ fontSize: 24, fontWeight: '800', color: Colors.paymentReceived }}
          />

          {/* Live Remaining Balance Calculation */}
          {paymentAmountPaise > 0 && (
            <View style={styles.calculationPreview}>
              <Text style={styles.calcLabel}>{t('remainingBalanceAfterPayment', language)}:</Text>
              <Text
                style={[
                  styles.calcValue,
                  remainingBalancePaise > 0
                    ? { color: Colors.creditSale }
                    : remainingBalancePaise < 0
                    ? { color: Colors.advanceBalance }
                    : { color: Colors.paymentReceived },
                ]}
              >
                {formatCurrency(remainingBalancePaise)}
                {remainingBalancePaise === 0
                  ? ` (${t('settledZeroTag', language)})`
                  : remainingBalancePaise < 0
                  ? ` (${t('advanceBalanceTag', language)})`
                  : ` (${t('remainingDueTag', language)})`}
              </Text>
            </View>
          )}

          {/* Payment Date Picker */}
          <DatePickerField
            label={`${t('transactionDate', language)} *`}
            value={date}
            onChange={setDate}
          />

          {/* Payment Method Selector */}
          <Text style={styles.label}>{t('paymentMethod', language)}</Text>
          <View style={styles.methodsRow}>
            {methods.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[
                  styles.methodBtn,
                  paymentMethod === m.id && styles.activeMethodBtn,
                ]}
                onPress={() => setPaymentMethod(m.id)}
              >
                <Ionicons
                  name={m.icon}
                  size={16}
                  color={paymentMethod === m.id ? Colors.primaryForeground : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.methodBtnText,
                    paymentMethod === m.id && styles.activeMethodBtnText,
                  ]}
                >
                  {t(m.labelKey, language)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Reference Number */}
          <Input
            label={t('referenceNumber', language)}
            placeholder={language === 'hi' ? 'जैसे: UPI ट्रांजैक्शन ID या रसीद क्र.' : 'e.g. UPI Ref ID or receipt no.'}
            value={refNumber}
            onChangeText={setRefNumber}
          />

          {/* Remarks */}
          <Input
            label={t('notes', language)}
            placeholder={language === 'hi' ? 'जैसे: 220 जमा, मक्का वाले, आदि' : 'e.g. Partial cash payment'}
            value={notes}
            onChangeText={setNotes}
          />

          <Button
            title={`${t('recordPaymentBtn', language)} (${amount ? `₹${amount}` : ''})`}
            onPress={handleSavePayment}
            loading={loading}
            variant="success"
            size="lg"
            style={styles.saveBtn}
            icon={<Ionicons name="checkmark-circle-outline" size={20} color={Colors.textInverse} />}
          />
        </Card>
      </ScrollView>

      {/* Customer Picker Modal */}
      <Modal visible={customerModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('selectCustomer', language)}</Text>
              <TouchableOpacity onPress={() => setCustomerModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Input
              placeholder={t('searchCustomerPlaceholder', language)}
              value={searchCust}
              onChangeText={setSearchCust}
              containerStyle={{ marginBottom: Spacing.sm }}
            />

            <FlatList
              data={filteredModalCusts}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.custOption,
                    selectedCustomer?.id === item.id && styles.selectedCustOption,
                  ]}
                  onPress={() => {
                    setSelectedCustomer(item);
                    setCustomerModalVisible(false);
                  }}
                >
                  <View style={styles.optionAvatar}>
                    <Text style={styles.optionAvatarText}>{item.name.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionName}>{item.name}</Text>
                    <Text style={styles.optionSub}>{item.villageName || '-'} • {item.mobile}</Text>
                  </View>
                  <Text style={styles.optionDue}>{formatCurrency(item.currentBalancePaise)}</Text>
                </TouchableOpacity>
              )}
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
  scrollContent: {
    padding: Spacing.lg,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  customerSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSubtle,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  custAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  custName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  custVillage: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  duePreviewBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  duePreviewLabel: {
    fontSize: 11,
    color: '#991B1B',
  },
  duePreviewVal: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.creditSale,
    marginTop: 2,
  },
  fullPayChip: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  fullPayText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.creditSale,
  },
  calculationPreview: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.paymentReceived,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  calcBorderTop: {
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    paddingTop: 4,
    marginTop: 4,
  },
  calcLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  calcValue: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  methodsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  methodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 6,
  },
  activeMethodBtn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  methodBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activeMethodBtnText: {
    color: Colors.textInverse,
  },
  saveBtn: {
    marginTop: Spacing.md,
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
  custOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  selectedCustOption: {
    backgroundColor: Colors.paymentReceivedLight,
    borderRadius: BorderRadius.sm,
  },
  optionAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
  optionName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  optionSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  optionDue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.creditSale,
  },
});
