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
import { toPaise, formatCurrency } from '../../utils/money';
import { getTodayIST, formatDisplayDate } from '../../utils/date';
import { DataRepository } from '../../services/db';
import { Customer, Transaction } from '../../types';
import { Ionicons } from '@expo/vector-icons';

export const AddUdhaarScreen: React.FC = () => {
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
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('kg');
  const [rate, setRate] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [refNumber, setRefNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [idempotencyKey] = useState(`idemp_udhaar_${Date.now()}_${Math.random().toString(36).substring(7)}`);

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
      return active.length > 0 ? active[0] : null;
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

  const computedTotal = () => {
    const q = parseFloat(quantity);
    const r = parseFloat(rate);
    if (!isNaN(q) && !isNaN(r) && q > 0 && r > 0) {
      return (q * r).toFixed(2);
    }
    return manualAmount;
  };

  const finalAmount = computedTotal();

  const handleSaveUdhaar = async () => {
    if (!selectedCustomer) {
      Alert.alert(t('error', language), t('pleaseSelectCustomer', language));
      return;
    }

    const amountNum = parseFloat(finalAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert(t('error', language), t('enterValidAmount', language));
      return;
    }

    if (!description.trim()) {
      Alert.alert(t('error', language), t('enterItemDescription', language));
      return;
    }

    setLoading(true);
    try {
      const amountPaise = toPaise(amountNum);
      const ratePaise = rate ? toPaise(parseFloat(rate)) : undefined;
      const qtyNum = quantity ? parseFloat(quantity) : undefined;

      const tx: Transaction = {
        id: `tx_${Date.now()}`,
        businessId: business!.id,
        customerId: selectedCustomer.id,
        type: 'CREDIT_SALE',
        amountPaise,
        description: description.trim(),
        quantity: qtyNum,
        unit: qtyNum ? unit : undefined,
        ratePaise,
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
        Alert.alert(
          t('udhaarRecordedSuccess', language),
          `${selectedCustomer.name}: ${formatCurrency(amountPaise)}\n${t('currentOutstanding', language)}: ${formatCurrency(result.newBalancePaise)}`,
          [
            {
              text: t('viewLedgerBtn', language),
              onPress: () => {
                navigation.replace('CustomerLedger', {
                  customer: {
                    ...selectedCustomer,
                    currentBalancePaise: result.newBalancePaise,
                  },
                });
              },
            },
            {
              text: t('addNewBtn', language),
              onPress: () => {
                setDescription('');
                setQuantity('');
                setRate('');
                setManualAmount('');
              },
            },
          ]
        );
      } else {
        Alert.alert(t('error', language), result.error || 'Error saving transaction');
      }
    } catch (err: any) {
      setLoading(false);
      Alert.alert(t('error', language), err.message);
    }
  };

  const filteredModalCusts = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchCust.toLowerCase()) ||
      c.mobile.includes(searchCust) ||
      (c.villageName && c.villageName.toLowerCase().includes(searchCust))
  );

  return (
    <View style={styles.screen}>
      <Header
        title={t('giveCredit', language)}
        subtitle={t('giveCreditDesc', language)}
        showBack
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card>
          {/* Customer Selection Banner */}
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
                  {formatCurrency(selectedCustomer?.currentBalancePaise || 0)}
                </Text>
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>

          {/* Transaction Date Picker */}
          <DatePickerField
            label={`${t('transactionDate', language)} *`}
            value={date}
            onChange={setDate}
          />

          {/* Particulars / Goods */}
          <Input
            label={`${t('itemDescription', language)} *`}
            placeholder={language === 'hi' ? 'जैसे: धान बीज, खाद, कीटनाशक' : 'e.g. Rice seeds, Fertilizer'}
            value={description}
            onChangeText={setDescription}
          />

          {/* Optional Qty, Unit, Rate row */}
          <View style={styles.row3}>
            <View style={{ flex: 1 }}>
              <Input
                label={t('quantity', language)}
                placeholder="0"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
              />
            </View>
            <View style={{ width: 80 }}>
              <Input
                label={t('unit', language)}
                placeholder="kg"
                value={unit}
                onChangeText={setUnit}
              />
            </View>
            <View style={{ flex: 1.2 }}>
              <Input
                label={t('ratePerUnit', language)}
                placeholder="₹ 0.00"
                value={rate}
                onChangeText={setRate}
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Total Amount Input / Computed preview */}
          <Input
            label={`${t('totalAmount', language)} *`}
            placeholder="0.00"
            prefix="₹"
            value={finalAmount}
            onChangeText={setManualAmount}
            keyboardType="numeric"
            style={{ fontSize: 20, fontWeight: '700', color: Colors.creditSale }}
            helperText={
              quantity && rate
                ? `${t('calculationPrefix', language)}: ${quantity} ${unit} × ₹${rate} = ₹${finalAmount}`
                : t('directAmountHelper', language)
            }
          />

          {/* Bill / Ref No */}
          <Input
            label={t('referenceNumber', language)}
            placeholder={t('invoiceReceiptOptional', language)}
            value={refNumber}
            onChangeText={setRefNumber}
          />

          {/* Notes */}
          <Input
            label={t('notes', language)}
            placeholder={t('specialNotesOptional', language)}
            value={notes}
            onChangeText={setNotes}
          />

          <Button
            title={`${t('giveCredit', language)} (${finalAmount ? `₹${finalAmount}` : ''})`}
            onPress={handleSaveUdhaar}
            loading={loading}
            variant="danger"
            size="lg"
            style={styles.saveBtn}
            icon={<Ionicons name="remove-circle-outline" size={20} color={Colors.textInverse} />}
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
  row3: {
    flexDirection: 'row',
    gap: Spacing.sm,
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
    backgroundColor: Colors.creditSaleLight,
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
