import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { t } from '../../i18n';
import { formatCurrency } from '../../utils/money';
import { formatDisplayDate } from '../../utils/date';
import { ReminderService } from '../../services/reminderService';
import { Customer, Transaction } from '../../types';
import { Ionicons } from '@expo/vector-icons';

export const ReceiptScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { business, language } = useApp();

  const customer: Customer = route.params?.customer;
  const transaction: Transaction = route.params?.transaction;
  const previousBalancePaise: number = route.params?.previousBalancePaise || 0;

  const [sharing, setSharing] = useState(false);

  const receiptText = ReminderService.generateReceiptMessage(
    business!,
    customer,
    transaction.amountPaise,
    transaction.paymentMethod || 'CASH',
    transaction.referenceNumber,
    language
  );

  const handleShareWhatsApp = async () => {
    setSharing(true);
    await ReminderService.sendViaWhatsApp(customer.mobile, receiptText);
    setSharing(false);
  };

  const handleShareGeneral = async () => {
    setSharing(true);
    await ReminderService.shareGeneral(receiptText);
    setSharing(false);
  };

  return (
    <View style={styles.screen}>
      <Header
        title={t('paymentReceipt', language)}
        showBack
        onBack={() => navigation.navigate('MainTabs', { screen: 'DashboardTab' })}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Success Icon */}
        <View style={styles.successIconCircle}>
          <Ionicons name="checkmark-sharp" size={44} color={Colors.textInverse} />
        </View>
        <Text style={styles.successHeading}>{t('paymentSuccessHeading', language)}</Text>
        <Text style={styles.successSub}>
          {formatDisplayDate(transaction.date)} {t('paymentRecordedOn', language)}
        </Text>

        {/* Printable/Shareable Receipt Card */}
        <Card style={styles.receiptCard}>
          <View style={styles.shopHeader}>
            <Text style={styles.shopName}>{business?.name}</Text>
            <Text style={styles.shopPhone}>{t('phone', language)}: {business?.phone}</Text>
          </View>

          <View style={styles.divider} />

          {/* Customer & Village */}
          <View style={styles.row}>
            <Text style={styles.label}>{t('customerAccountLabel', language)}:</Text>
            <Text style={styles.valueBold}>{customer.name}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('village', language)}:</Text>
            <Text style={styles.value}>{customer.villageName || '-'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('mobileLabel', language)}:</Text>
            <Text style={styles.value}>{customer.mobile}</Text>
          </View>

          <View style={styles.divider} />

          {/* Payment amount */}
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>{t('receivedAmountReceipt', language)}</Text>
            <Text style={styles.amountVal}>{formatCurrency(transaction.amountPaise)}</Text>
          </View>
          {transaction.discountPaise ? (
            <View style={[styles.row, { marginTop: 8 }]}>
              <Text style={styles.label}>{t('discountAmount', language)}:</Text>
              <Text style={[styles.valueBold, { color: '#D97706' }]}>
                {formatCurrency(transaction.discountPaise)}
              </Text>
            </View>
          ) : null}
          {transaction.discountPaise ? (
            <View style={styles.row}>
              <Text style={styles.label}>{t('totalSettledAmount', language)}:</Text>
              <Text style={[styles.valueBold, { color: Colors.primary }]}>
                {formatCurrency(transaction.amountPaise + transaction.discountPaise)}
              </Text>
            </View>
          ) : null}

          <View style={styles.row}>
            <Text style={styles.label}>{t('paymentMethodLabel', language)}:</Text>
            <Text style={styles.valueBold}>{transaction.paymentMethod || 'CASH'}</Text>
          </View>
          {transaction.referenceNumber ? (
            <View style={styles.row}>
              <Text style={styles.label}>{t('refReceiptLabel', language)}:</Text>
              <Text style={styles.value}>{transaction.referenceNumber}</Text>
            </View>
          ) : null}

          <View style={styles.divider} />

          {/* Balance breakdown */}
          <View style={styles.row}>
            <Text style={styles.label}>{t('previousDueLabel', language)}:</Text>
            <Text style={styles.value}>{formatCurrency(previousBalancePaise)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('remainingDueLabel', language)}:</Text>
            <Text
              style={[
                styles.valueBold,
                customer.currentBalancePaise > 0
                  ? { color: Colors.creditSale }
                  : { color: Colors.paymentReceived },
              ]}
            >
              {formatCurrency(customer.currentBalancePaise)}
            </Text>
          </View>
        </Card>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <Button
            title={t('sendReceiptWhatsApp', language)}
            onPress={handleShareWhatsApp}
            loading={sharing}
            variant="success"
            size="lg"
            icon={<Ionicons name="logo-whatsapp" size={22} color={Colors.textInverse} />}
            style={styles.actionBtn}
          />

          <Button
            title={t('shareReceipt', language)}
            onPress={handleShareGeneral}
            variant="outline"
            size="md"
            icon={<Ionicons name="share-social-outline" size={18} color={Colors.primary} />}
            style={styles.actionBtn}
          />

          <Button
            title={t('viewLedgerBtn', language)}
            onPress={() => navigation.replace('CustomerLedger', { customer })}
            variant="secondary"
            size="md"
            style={styles.actionBtn}
          />
        </View>
      </ScrollView>
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
    alignItems: 'center',
  },
  successIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.paymentReceived,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
    elevation: 4,
  },
  successHeading: {
    ...Typography.h2,
    color: Colors.textPrimary,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  successSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
    marginBottom: Spacing.lg,
  },
  receiptCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    borderWidth: 1.5,
    borderColor: '#86EFAC',
  },
  shopHeader: {
    alignItems: 'center',
  },
  shopName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primary,
    textAlign: 'center',
  },
  shopPhone: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  label: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  value: {
    fontSize: 13,
    color: Colors.textPrimary,
  },
  valueBold: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  amountBox: {
    alignItems: 'center',
    backgroundColor: Colors.paymentReceivedLight,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginVertical: Spacing.xs,
  },
  amountLabel: {
    fontSize: 12,
    color: Colors.paymentReceivedText,
    fontWeight: '600',
  },
  amountVal: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.paymentReceived,
    marginTop: 2,
  },
  actionsContainer: {
    width: '100%',
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  actionBtn: {
    width: '100%',
  },
});
