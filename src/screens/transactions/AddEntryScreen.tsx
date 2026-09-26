import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Header } from '../../components/Header';
import { DatePickerField } from '../../components/DatePickerField';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { t } from '../../i18n';
import { toPaise, toRupees, formatCurrency } from '../../utils/money';
import { getTodayIST, formatDisplayDate, addDaysToDate } from '../../utils/date';
import { DataRepository } from '../../services/db';
import { Customer, Transaction, PaymentMethod } from '../../types';
import { confirmAction, showAlert } from '../../utils/dialog';
import { Ionicons } from '@expo/vector-icons';

type EntryMode = 'CREDIT' | 'PAYMENT';

export const AddEntryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { business, language, refreshAllData, isAuthenticated, guardAction } = useApp();

  const preselectedCustomer: Customer | undefined = route.params?.customer;
  const editingTransaction: Transaction | undefined = route.params?.editingTransaction;
  const isEditing = !!editingTransaction;
  const initialMode: EntryMode =
    editingTransaction
      ? (editingTransaction.type === 'CREDIT_SALE' ? 'CREDIT' : 'PAYMENT')
      : route.params?.initialMode ||
        (route.name === 'ReceivePayment' ? 'PAYMENT' : 'CREDIT');

  const [mode, setMode] = useState<EntryMode>(initialMode);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    preselectedCustomer || null
  );
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [searchCust, setSearchCust] = useState('');

  // Common fields
  const [date, setDate] = useState(
    editingTransaction?.date ? editingTransaction.date.substring(0, 10) : getTodayIST()
  );
  const [dueDate, setDueDate] = useState<string>(
    editingTransaction?.dueDate || addDaysToDate(getTodayIST(), 15)
  );
  const [refNumber, setRefNumber] = useState(editingTransaction?.referenceNumber || '');
  const [notes, setNotes] = useState(editingTransaction?.notes || '');
  const [loading, setLoading] = useState(false);

  // Credit (Udhaar / Sale) specific fields
  const [description, setDescription] = useState(
    editingTransaction?.type === 'CREDIT_SALE' ? editingTransaction.description : ''
  );
  const [quantity, setQuantity] = useState(
    editingTransaction?.quantity ? String(editingTransaction.quantity) : '1'
  );
  const [unit, setUnit] = useState(editingTransaction?.unit || 'kg');
  const [rate, setRate] = useState(
    editingTransaction?.ratePaise ? (editingTransaction.ratePaise / 100).toString() : ''
  );
  const [manualAmount, setManualAmount] = useState(
    editingTransaction?.type === 'CREDIT_SALE'
      ? (editingTransaction.amountPaise / 100).toString()
      : ''
  );
  const [receivedAmount, setReceivedAmount] = useState(
    editingTransaction?.receivedAmountPaise
      ? (editingTransaction.receivedAmountPaise / 100).toString()
      : ''
  );
  const [salePaymentMethod, setSalePaymentMethod] = useState<PaymentMethod>('CASH');

  // Payment specific fields
  const [paymentAmount, setPaymentAmount] = useState(
    editingTransaction?.type === 'PAYMENT'
      ? (editingTransaction.amountPaise / 100).toString()
      : ''
  );
  const [discountAmount, setDiscountAmount] = useState(
    editingTransaction?.discountPaise
      ? (editingTransaction.discountPaise / 100).toString()
      : ''
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    editingTransaction?.paymentMethod || 'CASH'
  );

  useEffect(() => {
    const loadCustomers = async () => {
      if (!business) return;
      const list = await DataRepository.getCustomers(business.id);
      const active = list.filter((c) => c.status !== 'INACTIVE');
      setCustomers(active);
      if (!selectedCustomer && active.length > 0) {
        if (editingTransaction) {
          const match = active.find((c) => c.id === editingTransaction.customerId);
          if (match) setSelectedCustomer(match);
        } else if (mode === 'PAYMENT') {
          const dueCust = active.find((c) => (c.currentBalancePaise || 0) > 0);
          setSelectedCustomer(dueCust || active[0]);
        } else {
          setSelectedCustomer(active[0]);
        }
      }
    };
    loadCustomers();
  }, [business, mode, editingTransaction]);

  // Udhaar computed amount
  const computedCreditTotal = () => {
    const q = parseFloat(quantity);
    const r = parseFloat(rate);
    if (!isNaN(q) && !isNaN(r) && q > 0 && r > 0) {
      return (q * r).toFixed(2);
    }
    return manualAmount;
  };

  const finalCreditAmount = computedCreditTotal();

  // Payment calculations
  const currentDuePaise = selectedCustomer?.currentBalancePaise || 0;
  const paymentAmountPaise = toPaise(paymentAmount || 0);
  const discountAmountPaise = toPaise(discountAmount || 0);
  const totalSettledPaise = paymentAmountPaise + discountAmountPaise;
  const remainingBalancePaise = currentDuePaise - totalSettledPaise;

  const setFullDueAmount = () => {
    if (currentDuePaise > 0) {
      setPaymentAmount(toRupees(currentDuePaise).toString());
      setDiscountAmount('');
    }
  };

  // Submission handler
  const handleSaveEntry = async () => {
    if (!isAuthenticated) {
      guardAction(() => handleSaveEntry());
      return;
    }

    if (!business) {
      showAlert(t('error', language), language === 'hi' ? 'बिजनेस लोड नहीं हुआ' : 'Business not loaded', undefined, 'danger');
      return;
    }

    if (!selectedCustomer) {
      showAlert(
        t('error', language), 
        language === 'hi' ? 'कृपया ग्राहक चुनें!' : 'Please select a customer!', 
        undefined, 
        'warning'
      );
      return;
    }

    if (mode === 'CREDIT') {
      const amountNum = parseFloat(finalCreditAmount);
      if (isNaN(amountNum) || amountNum <= 0) {
        showAlert(
          t('error', language), 
          language === 'hi' ? 'कृपया कुल राशि (Total Amount) भरें!' : 'Please enter a valid total amount!', 
          undefined, 
          'warning'
        );
        return;
      }
      if (!description.trim()) {
        showAlert(
          t('error', language), 
          language === 'hi' ? 'कृपया सामान का नाम भरें! (जैसे: बीज, खाद)' : 'Please enter item description! (e.g. Seeds, Fertilizer)', 
          undefined, 
          'warning'
        );
        return;
      }

      const receivedNum = parseFloat(receivedAmount);
      const hasReceived = !isNaN(receivedNum) && receivedNum > 0;
      const receivedPaise = hasReceived ? toPaise(receivedNum) : 0;

      setLoading(true);
      try {
        const amountPaise = toPaise(amountNum);
        const ratePaise = rate ? toPaise(parseFloat(rate)) : undefined;
        const qtyNum = quantity ? parseFloat(quantity) : undefined;

        if (isEditing && editingTransaction) {
          const updatedTx: Transaction = {
            ...editingTransaction,
            customerId: selectedCustomer.id,
            amountPaise,
            receivedAmountPaise: hasReceived ? receivedPaise : undefined,
            dueDate: dueDate || undefined,
            description: description.trim(),
            quantity: qtyNum,
            unit: qtyNum ? unit : undefined,
            ratePaise,
            notes: notes.trim() || undefined,
            date,
          };
          const result = await DataRepository.updateTransaction(updatedTx);
          await refreshAllData();
          setLoading(false);
          if (result.success) {
            showAlert(
              t('entryUpdatedSuccess', language),
              `${selectedCustomer.name}: ${formatCurrency(amountPaise)}\n${t('currentOutstanding', language)}: ${formatCurrency(result.newBalancePaise)}`,
              () => navigation.goBack(),
              'success'
            );
          } else {
            showAlert(t('error', language), result.error || 'Error updating credit transaction', undefined, 'danger');
          }
          return;
        }

        const tx: Transaction = {
          id: `tx_${Date.now()}`,
          businessId: business!.id,
          customerId: selectedCustomer.id,
          type: 'CREDIT_SALE',
          amountPaise,
          receivedAmountPaise: hasReceived ? receivedPaise : undefined,
          dueDate: dueDate || undefined,
          description: description.trim(),
          quantity: qtyNum,
          unit: qtyNum ? unit : undefined,
          ratePaise,
          notes: notes.trim() || undefined,
          date,
          createdAt: new Date().toISOString(),
          idempotencyKey: `idemp_udhaar_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        };

        const result = await DataRepository.recordTransaction(tx);
        let finalBalancePaise = result.newBalancePaise;

        // If customer paid an amount at the time of sale, record corresponding PAYMENT
        if (result.success && hasReceived) {
          const payTx: Transaction = {
            id: `tx_pay_${Date.now() + 1}`,
            businessId: business!.id,
            customerId: selectedCustomer.id,
            type: 'PAYMENT',
            amountPaise: receivedPaise,
            paymentMethod: salePaymentMethod,
            description:
              language === 'hi'
                ? `बिक्री के समय भुगतान प्राप्त (${description.trim()})`
                : `Payment at sale (${description.trim()})`,
            referenceNumber: tx.id,
            notes: notes.trim() || undefined,
            date,
            createdAt: new Date(Date.now() + 500).toISOString(),
            idempotencyKey: `idemp_pay_sale_${tx.id}`,
          };
          const payResult = await DataRepository.recordTransaction(payTx);
          if (payResult.success) {
            finalBalancePaise = payResult.newBalancePaise;
          }
        }

        await refreshAllData();
        setLoading(false);

        if (result.success) {
          let summaryDetails = `${selectedCustomer.name}\n${t('totalAmount', language)}: ${formatCurrency(amountPaise)}`;
          if (hasReceived) {
            summaryDetails += `\n${t('receivedPaymentAtSale', language)}: ${formatCurrency(receivedPaise)}`;
            summaryDetails += `\n${t('netBalanceAddedToLedger', language)}: ${formatCurrency(amountPaise - receivedPaise)}`;
          }
          summaryDetails += `\n${t('currentOutstanding', language)}: ${formatCurrency(finalBalancePaise)}`;

          confirmAction(
            language === 'hi' ? 'बिक्री प्रविष्टि दर्ज की गई' : 'Sale Entry Recorded Successfully',
            summaryDetails,
            () => {
              navigation.replace('CustomerLedger', {
                customer: {
                  ...selectedCustomer,
                  currentBalancePaise: finalBalancePaise,
                },
              });
            },
            t('viewLedgerBtn', language),
            t('addNewBtn', language),
            'success',
            () => {
              // Reset form for next entry
              setDescription('');
              setQuantity('1');
              setRate('');
              setManualAmount('');
              setReceivedAmount('');
              setNotes('');
            }
          );
        } else {
          Alert.alert(t('error', language), result.error || 'Error saving credit transaction');
        }
      } catch (err: any) {
        setLoading(false);
        Alert.alert(t('error', language), err.message);
      }
    } else {
      // Payment mode
      const amountNum = parseFloat(paymentAmount);
      if (isNaN(amountNum) || amountNum <= 0) {
        Alert.alert(t('error', language), t('enterValidAmount', language));
        return;
      }

      setLoading(true);
      try {
        if (isEditing && editingTransaction) {
          const updatedTx: Transaction = {
            ...editingTransaction,
            customerId: selectedCustomer.id,
            amountPaise: paymentAmountPaise,
            discountPaise: discountAmountPaise > 0 ? discountAmountPaise : undefined,
            description: discountAmountPaise > 0
              ? `${notes.trim() || (language === 'hi' ? 'भुगतान प्राप्त' : 'Payment Received')} (${t('discountBadge', language)}: ${formatCurrency(discountAmountPaise)})`
              : notes.trim() || (language === 'hi' ? 'भुगतान प्राप्त (जमा)' : 'Payment Received'),
            paymentMethod,
            referenceNumber: refNumber.trim() || undefined,
            notes: notes.trim() || undefined,
            date,
          };
          const result = await DataRepository.updateTransaction(updatedTx);
          await refreshAllData();
          setLoading(false);
          if (result.success) {
            showAlert(
              t('entryUpdatedSuccess', language),
              `${selectedCustomer.name}: ${formatCurrency(paymentAmountPaise)}\n${t('currentOutstanding', language)}: ${formatCurrency(result.newBalancePaise)}`,
              () => navigation.goBack(),
              'success'
            );
          } else {
            showAlert(t('error', language), result.error || 'Error updating payment', undefined, 'danger');
          }
          return;
        }

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
          idempotencyKey: `idemp_pay_${Date.now()}_${Math.random().toString(36).substring(7)}`,
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
    }
  };

  const handleDeleteTransaction = () => {
    if (!editingTransaction || !business) return;
    confirmAction(
      t('deleteEntry', language),
      t('deleteEntryConfirm', language),
      async () => {
        setLoading(true);
        const res = await DataRepository.deleteTransaction(business.id, editingTransaction.id);
        await refreshAllData();
        setLoading(false);
        if (res.success) {
          showAlert(
            t('success', language),
            t('entryDeletedSuccess', language),
            () => navigation.goBack(),
            'success'
          );
        } else {
          showAlert(t('error', language), res.error || 'Failed to delete transaction', undefined, 'danger');
        }
      },
      t('delete', language),
      t('cancel', language)
    );
  };

  const methods: { id: PaymentMethod; labelKey: keyof typeof import('../../i18n').translations.en; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'CASH', labelKey: 'cash', icon: 'cash-outline' },
    { id: 'UPI', labelKey: 'upi', icon: 'qr-code-outline' },
    { id: 'BANK_TRANSFER', labelKey: 'bankTransfer', icon: 'business-outline' },
    { id: 'CHEQUE', labelKey: 'cheque', icon: 'document-text-outline' },
    { id: 'OTHER', labelKey: 'other', icon: 'ellipsis-horizontal-outline' },
  ];

  const commonUnits = ['kg', 'bag', 'litre', 'pkt', 'pc', 'quintal'];

  const filteredModalCusts = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchCust.toLowerCase()) ||
      c.mobile.includes(searchCust) ||
      (c.villageName && c.villageName.toLowerCase().includes(searchCust))
  );

  return (
    <View style={styles.screen}>
      <Header
        title={
          isEditing
            ? (mode === 'CREDIT' ? t('editSaleEntry', language) : t('editPayment', language))
            : (mode === 'CREDIT' ? t('addSaleEntry', language) : t('receivePayment', language))
        }
        subtitle={mode === 'CREDIT' ? t('giveCreditDesc', language) : t('receivePaymentDesc', language)}
        showBack
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Top Segmented Mode Selector: Sale / Udhaar (+) vs Payment (-) */}
        <View style={styles.segmentedContainer}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.segmentBtn, mode === 'CREDIT' && styles.activeCreditSegment]}
            onPress={() => setMode('CREDIT')}
          >
            <Ionicons
              name="add-circle"
              size={18}
              color={mode === 'CREDIT' ? '#DC2626' : Colors.textSecondary}
            />
            <Text
              style={[
                styles.segmentText,
                mode === 'CREDIT' && styles.activeCreditText,
              ]}
            >
              {t('addSaleEntryTab', language)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.segmentBtn, mode === 'PAYMENT' && styles.activePaymentSegment]}
            onPress={() => setMode('PAYMENT')}
          >
            <Ionicons
              name="add-circle"
              size={18}
              color={mode === 'PAYMENT' ? '#16A34A' : Colors.textSecondary}
            />
            <Text
              style={[
                styles.segmentText,
                mode === 'PAYMENT' && styles.activePaymentText,
              ]}
            >
              {t('paymentEntryTab', language)}
            </Text>
          </TouchableOpacity>
        </View>

        <Card style={styles.mainCard}>
          {/* Customer Selection Card */}
          <Text style={styles.fieldLabel}>{t('customer', language)} *</Text>
          <TouchableOpacity
            style={styles.customerCardSelector}
            activeOpacity={0.8}
            onPress={() => setCustomerModalVisible(true)}
          >
            <View style={[styles.custAvatar, mode === 'CREDIT' ? styles.avatarCredit : styles.avatarPayment]}>
              <Text style={[styles.avatarText, mode === 'CREDIT' ? { color: Colors.creditSale } : { color: Colors.paymentReceived }]}>
                {selectedCustomer?.name.charAt(0) || '?'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.custName}>{selectedCustomer?.name || t('selectCustomer', language)}</Text>
              <Text style={styles.custSubtitle}>
                {selectedCustomer?.villageName || t('noVillageRecorded', language)} • {selectedCustomer?.mobile}
              </Text>
            </View>
            <View style={styles.dueBadgeCol}>
              <Text style={styles.dueBadgeLabel}>{t('statusDue', language)}</Text>
              <Text style={[styles.dueBadgeAmount, { color: Colors.creditSale }]}>
                {formatCurrency(currentDuePaise)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>

          {/* Mode 1: Credit Sale (Udhaar) Fields */}
          {mode === 'CREDIT' ? (
            <>
              {/* Transaction Date Picker */}
              <DatePickerField
                label={`${t('transactionDate', language)} *`}
                value={date}
                onChange={setDate}
              />

              {/* Payment Due Date with Quick Presets */}
              <View style={styles.dueDateSection}>
                <DatePickerField
                  label={`${t('paymentDueDate', language)} *`}
                  value={dueDate}
                  onChange={setDueDate}
                />
                {/* Quick Presets for Due Date */}
                <View style={styles.duePresetsRow}>
                  <TouchableOpacity
                    style={[styles.duePresetChip, dueDate === addDaysToDate(date, 7) && styles.activeDuePresetChip]}
                    onPress={() => setDueDate(addDaysToDate(date, 7))}
                  >
                    <Text style={[styles.duePresetText, dueDate === addDaysToDate(date, 7) && styles.activeDuePresetText]}>
                      {t('presetPlus7Days', language)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.duePresetChip, dueDate === addDaysToDate(date, 15) && styles.activeDuePresetChip]}
                    onPress={() => setDueDate(addDaysToDate(date, 15))}
                  >
                    <Text style={[styles.duePresetText, dueDate === addDaysToDate(date, 15) && styles.activeDuePresetText]}>
                      {t('presetPlus15Days', language)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.duePresetChip, dueDate === addDaysToDate(date, 30) && styles.activeDuePresetChip]}
                    onPress={() => setDueDate(addDaysToDate(date, 30))}
                  >
                    <Text style={[styles.duePresetText, dueDate === addDaysToDate(date, 30) && styles.activeDuePresetText]}>
                      {t('presetPlus30Days', language)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.duePresetChip, dueDate === addDaysToDate(date, 60) && styles.activeDuePresetChip]}
                    onPress={() => setDueDate(addDaysToDate(date, 60))}
                  >
                    <Text style={[styles.duePresetText, dueDate === addDaysToDate(date, 60) && styles.activeDuePresetText]}>
                      {t('presetPlus60Days', language)}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.dueDateHelperText}>
                  ℹ️ {t('paymentDueDateHelper', language)}
                </Text>
              </View>

              {/* Particulars / Goods */}
              <Input
                label={`${t('itemDescription', language)} *`}
                placeholder={language === 'hi' ? 'जैसे: धान बीज (Dhan), डीएपी खाद' : 'e.g. Rice seeds, Fertilizer'}
                value={description}
                onChangeText={setDescription}
              />

              {/* Clean, well-spaced Quantity, Unit, Rate Section */}
              <View style={styles.quantitiesCard}>
                <View style={styles.quantitiesGrid}>
                  {/* Qty Box */}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subColLabel}>{t('quantity', language)}</Text>
                    <Input
                      placeholder="0"
                      value={quantity}
                      onChangeText={setQuantity}
                      keyboardType="numeric"
                      containerStyle={{ marginBottom: 0 }}
                      style={styles.compactInput}
                    />
                  </View>

                  {/* Unit Box */}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subColLabel}>{t('unit', language)}</Text>
                    <Input
                      placeholder="kg"
                      value={unit}
                      onChangeText={setUnit}
                      containerStyle={{ marginBottom: 0 }}
                      style={styles.compactInput}
                    />
                  </View>

                  {/* Rate Box */}
                  <View style={{ flex: 1.2 }}>
                    <Text style={styles.subColLabel}>{t('ratePerUnit', language)}</Text>
                    <Input
                      placeholder="₹ 0.00"
                      value={rate}
                      onChangeText={setRate}
                      keyboardType="numeric"
                      containerStyle={{ marginBottom: 0 }}
                      style={styles.compactInput}
                    />
                  </View>
                </View>

                {/* Quick Unit Chips */}
                <View style={styles.unitChipsRow}>
                  {commonUnits.map((u) => (
                    <TouchableOpacity
                      key={u}
                      style={[styles.unitChip, unit === u && styles.activeUnitChip]}
                      onPress={() => setUnit(u)}
                    >
                      <Text style={[styles.unitChipText, unit === u && styles.activeUnitChipText]}>
                        {u}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Total Amount Input with live preview */}
              <Input
                label={`${t('totalAmount', language)} *`}
                placeholder="0.00"
                prefix="₹"
                value={finalCreditAmount}
                onChangeText={setManualAmount}
                keyboardType="numeric"
                style={{ fontSize: 24, fontWeight: '800', color: Colors.creditSale }}
                helperText={
                  quantity && rate
                    ? `${t('calculationPrefix', language)}: ${quantity} ${unit} × ₹${rate} = ₹${finalCreditAmount}`
                    : t('directAmountHelper', language)
                }
              />
            </>
          ) : (
            /* Mode 2: Receive Payment (Jama) Fields */
            <>
              {/* Current Due Preview & Full Pay Chip */}
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
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                keyboardType="numeric"
                style={{ fontSize: 24, fontWeight: '800', color: Colors.paymentReceived }}
              />

              {/* Discount / Concession Amount */}
              <Input
                label={t('discountAmount', language)}
                placeholder="0.00"
                prefix="₹"
                value={discountAmount}
                onChangeText={setDiscountAmount}
                keyboardType="numeric"
                style={{ fontSize: 18, fontWeight: '700', color: '#D97706' }}
                helperText={t('discountHelper', language)}
              />

              {/* Live Remaining Balance Calculation Preview */}
              {(paymentAmountPaise > 0 || discountAmountPaise > 0) && (
                <View style={styles.calculationPreview}>
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>{t('receivedAmountLabel', language)}:</Text>
                    <Text style={[styles.calcValue, { color: Colors.paymentReceived }]}>
                      {formatCurrency(paymentAmountPaise)}
                    </Text>
                  </View>
                  {discountAmountPaise > 0 && (
                    <View style={styles.calcRow}>
                      <Text style={styles.calcLabel}>{t('discountAmount', language)}:</Text>
                      <Text style={[styles.calcValue, { color: '#D97706' }]}>
                        + {formatCurrency(discountAmountPaise)}
                      </Text>
                    </View>
                  )}
                  {discountAmountPaise > 0 && (
                    <View style={[styles.calcRow, styles.calcBorderTop]}>
                      <Text style={[styles.calcLabel, { fontWeight: '700' }]}>{t('totalSettledAmount', language)}:</Text>
                      <Text style={[styles.calcValue, { fontWeight: '800', color: Colors.primary }]}>
                        {formatCurrency(totalSettledPaise)}
                      </Text>
                    </View>
                  )}
                  <View style={[styles.calcRow, { marginTop: 4 }]}>
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
                </View>
              )}

              {/* Transaction Date Picker */}
              <DatePickerField
                label={`${t('transactionDate', language)} *`}
                value={date}
                onChange={setDate}
              />

              {/* Payment Method Selector */}
              <Text style={styles.fieldLabel}>{t('paymentMethod', language)}</Text>
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
                      size={15}
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
            </>
          )}

          {/* In CREDIT mode: Receive payment amount in place of Invoice/Ref No */}
          {mode === 'CREDIT' ? (
            <View style={styles.receivedPaymentSection}>
              <Input
                label={t('receivedPaymentAtSale', language)}
                placeholder="0.00"
                prefix="₹"
                value={receivedAmount}
                onChangeText={setReceivedAmount}
                keyboardType="numeric"
                style={{ fontSize: 20, fontWeight: '700', color: Colors.paymentReceived }}
                helperText={t('receivedPaymentAtSaleHelper', language)}
              />

              {/* Quick Payment Method Selector (when customer pays at sale) */}
              {parseFloat(receivedAmount) > 0 && (
                <View style={styles.saleMethodSelector}>
                  <Text style={styles.saleMethodLabel}>{t('paymentMethod', language)}:</Text>
                  <View style={styles.saleMethodRow}>
                    {(['CASH', 'UPI', 'BANK_TRANSFER'] as PaymentMethod[]).map((pm) => (
                      <TouchableOpacity
                        key={pm}
                        style={[styles.saleMethodChip, salePaymentMethod === pm && styles.activeSaleMethodChip]}
                        onPress={() => setSalePaymentMethod(pm)}
                      >
                        <Ionicons
                          name={pm === 'CASH' ? 'cash-outline' : pm === 'UPI' ? 'qr-code-outline' : 'business-outline'}
                          size={14}
                          color={salePaymentMethod === pm ? Colors.primaryForeground : Colors.textSecondary}
                        />
                        <Text
                          style={[
                            styles.saleMethodText,
                            salePaymentMethod === pm && styles.activeSaleMethodText,
                          ]}
                        >
                          {pm === 'CASH' ? t('cash', language) : pm === 'UPI' ? t('upi', language) : t('bankTransfer', language)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Live Net Calculation Preview (Total Sale vs Received Payment) */}
              {parseFloat(finalCreditAmount) > 0 && parseFloat(receivedAmount) > 0 && (
                <View style={styles.saleCalculationPreview}>
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>{t('totalAmount', language)}:</Text>
                    <Text style={[styles.calcValue, { color: Colors.creditSale, fontWeight: '700' }]}>
                      {formatCurrency(toPaise(parseFloat(finalCreditAmount)))}
                    </Text>
                  </View>
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>{t('receivedPaymentAtSale', language)}:</Text>
                    <Text style={[styles.calcValue, { color: Colors.paymentReceived, fontWeight: '700' }]}>
                      - {formatCurrency(toPaise(parseFloat(receivedAmount)))}
                    </Text>
                  </View>
                  <View style={[styles.calcRow, styles.calcBorderTop]}>
                    <Text style={[styles.calcLabel, { fontWeight: '700' }]}>{t('netBalanceAddedToLedger', language)}:</Text>
                    <Text
                      style={[
                        styles.calcValue,
                        {
                          fontWeight: '800',
                          color:
                            parseFloat(finalCreditAmount) - parseFloat(receivedAmount) > 0
                              ? Colors.creditSale
                              : parseFloat(finalCreditAmount) - parseFloat(receivedAmount) < 0
                              ? Colors.advanceBalance
                              : Colors.paymentReceived,
                        },
                      ]}
                    >
                      {formatCurrency(toPaise(Math.max(0, parseFloat(finalCreditAmount) - parseFloat(receivedAmount))))}
                      {parseFloat(finalCreditAmount) === parseFloat(receivedAmount)
                        ? ` (${t('settledZeroTag', language)})`
                        : parseFloat(finalCreditAmount) < parseFloat(receivedAmount)
                        ? ` (${t('advanceBalanceTag', language)})`
                        : ''}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          ) : (
            /* In Payment mode: Reference / Bill No. */
            <Input
              label={t('referenceNumber', language)}
              placeholder={t('invoiceReceiptOptional', language)}
              value={refNumber}
              onChangeText={setRefNumber}
            />
          )}

          {/* Common fields: Notes / Remarks */}
          <Input
            label={t('notes', language)}
            placeholder={t('specialNotesOptional', language)}
            value={notes}
            onChangeText={setNotes}
          />

          {/* Submit Action Button with Clean Conditional Label (NO empty brackets) */}
          <Button
            title={
              isEditing
                ? mode === 'CREDIT'
                  ? `${t('updateEntryBtn', language)} (₹${finalCreditAmount})`
                  : `${t('updateEntryBtn', language)} (₹${paymentAmount})`
                : mode === 'CREDIT'
                ? finalCreditAmount && parseFloat(finalCreditAmount) > 0
                  ? `${t('addSaleEntry', language)} (₹${finalCreditAmount})`
                  : t('addSaleEntry', language)
                : paymentAmount && parseFloat(paymentAmount) > 0
                ? `${t('recordPaymentBtn', language)} (₹${paymentAmount})`
                : t('recordPaymentBtn', language)
            }
            onPress={handleSaveEntry}
            loading={loading}
            variant={mode === 'CREDIT' ? 'danger' : 'success'}
            size="lg"
            style={styles.saveBtn}
            icon={
              <Ionicons
                name={isEditing ? 'save-outline' : (mode === 'CREDIT' ? 'add-circle-outline' : 'checkmark-circle-outline')}
                size={22}
                color={Colors.textInverse}
              />
            }
          />

          {/* Delete Action Button (in Edit Mode) */}
          {isEditing && (
            <Button
              title={t('deleteEntry', language)}
              onPress={handleDeleteTransaction}
              loading={loading}
              variant="outline"
              size="md"
              style={styles.deleteBtn}
              icon={<Ionicons name="trash-outline" size={18} color={Colors.creditSale} />}
            />
          )}
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
              style={{ maxHeight: 320 }}
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
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: 5,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    gap: 6,
  },
  activeCreditSegment: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1.5,
    borderColor: '#F87171',
  },
  activePaymentSegment: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1.5,
    borderColor: '#4ADE80',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  activeCreditText: {
    color: '#991B1B',
  },
  activePaymentText: {
    color: '#166534',
  },
  mainCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  customerCardSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: '#F8FAFC',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  custAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCredit: {
    backgroundColor: '#FEE2E2',
  },
  avatarPayment: {
    backgroundColor: '#DCFCE7',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
  },
  custName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  custSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  dueBadgeCol: {
    alignItems: 'flex-end',
    marginRight: 4,
  },
  dueBadgeLabel: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  dueBadgeAmount: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 1,
  },
  quantitiesCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  quantitiesGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  subColLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  compactInput: {
    height: 42,
    fontSize: 14,
  },
  unitChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  unitChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activeUnitChip: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  unitChipText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  activeUnitChipText: {
    color: Colors.primary,
    fontWeight: '700',
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
    height: 52,
    borderRadius: BorderRadius.lg,
  },
  deleteBtn: {
    marginTop: Spacing.md,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
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
    backgroundColor: '#EFF6FF',
    borderRadius: BorderRadius.sm,
  },
  optionAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionAvatarText: {
    fontSize: 15,
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
  dueDateSection: {
    marginBottom: Spacing.xs,
  },
  duePresetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: -4,
    marginBottom: 6,
  },
  duePresetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activeDuePresetChip: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  duePresetText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activeDuePresetText: {
    color: '#B45309',
    fontWeight: '700',
  },
  dueDateHelperText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    marginBottom: Spacing.sm,
  },
  receivedPaymentSection: {
    marginBottom: Spacing.sm,
  },
  saleMethodSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    marginTop: -4,
  },
  saleMethodLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  saleMethodRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  saleMethodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 4,
  },
  activeSaleMethodChip: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  saleMethodText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activeSaleMethodText: {
    color: Colors.textInverse,
  },
  saleCalculationPreview: {
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.creditSale,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
