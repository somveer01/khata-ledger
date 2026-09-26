import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Transaction } from '../types';
import { formatCurrency } from '../utils/money';
import { formatLedgerDate, formatUpperDate } from '../utils/date';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

interface LedgerRowProps {
  transaction: Transaction;
  onPress?: () => void;
}

export const LedgerRow: React.FC<LedgerRowProps> = ({ transaction, onPress }) => {
  const isSale = transaction.type === 'CREDIT_SALE';
  const isPayment = transaction.type === 'PAYMENT';

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.container, transaction.isReversed && styles.reversedContainer]}
    >
      {/* Left: Date & Type icon */}
      <View style={styles.leftCol}>
        <View
          style={[
            styles.iconBubble,
            isSale ? styles.saleBubble : isPayment ? styles.paymentBubble : styles.neutralBubble,
          ]}
        >
          <Ionicons
            name={isSale ? 'arrow-up' : isPayment ? 'arrow-down' : 'swap-horizontal'}
            size={14}
            color={isSale ? Colors.creditSale : isPayment ? Colors.paymentReceived : Colors.textSecondary}
          />
        </View>
        <Text style={styles.dateText}>{formatLedgerDate(transaction.date)}</Text>
      </View>

      {/* Middle: Particulars / Item description */}
      <View style={styles.midCol}>
        <Text numberOfLines={2} style={[styles.descText, transaction.isReversed && styles.strikethrough]}>
          {transaction.description || (isSale ? 'उधार सामान' : 'भुगतान (जमा)')}
        </Text>
        {transaction.quantity ? (
          <Text style={styles.subDetail}>
            {transaction.quantity} {transaction.unit || ''} @ {formatCurrency(transaction.ratePaise || 0)}
          </Text>
        ) : null}
        {transaction.referenceNumber ? (
          <Text style={styles.refText}>बिल/रसीद: {transaction.referenceNumber}</Text>
        ) : null}
        {transaction.dueDate && isSale ? (
          <View style={styles.dueDateBadge}>
            <Ionicons name="calendar-outline" size={11} color="#B45309" />
            <Text style={styles.dueDateBadgeText}>देय: {formatUpperDate(transaction.dueDate)}</Text>
          </View>
        ) : null}
        {transaction.paymentMethod && isPayment ? (
          <Text style={styles.methodTag}>{transaction.paymentMethod}</Text>
        ) : null}
        {transaction.discountPaise && isPayment ? (
          <Text style={styles.discountTag}>छूट: {formatCurrency(transaction.discountPaise)}</Text>
        ) : null}
      </View>

      {/* Right: Amount & Running Balance */}
      <View style={styles.rightCol}>
        <Text
          style={[
            styles.amountText,
            isSale ? styles.saleText : isPayment ? styles.paymentText : styles.neutralText,
            transaction.isReversed && styles.strikethrough,
          ]}
        >
          {isSale ? '+' : '-'}
          {formatCurrency(transaction.amountPaise)}
        </Text>

        {transaction.runningBalancePaise !== undefined ? (
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>शेष:</Text>
            <Text
              style={[
                styles.balanceValue,
                transaction.runningBalancePaise > 0
                  ? styles.dueText
                  : transaction.runningBalancePaise < 0
                  ? styles.advanceText
                  : styles.zeroText,
              ]}
            >
              {formatCurrency(transaction.runningBalancePaise)}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  reversedContainer: {
    backgroundColor: '#FFF1F2',
    opacity: 0.7,
  },
  leftCol: {
    width: 82,
    alignItems: 'flex-start',
  },
  iconBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  saleBubble: {
    backgroundColor: Colors.creditSaleLight,
  },
  paymentBubble: {
    backgroundColor: Colors.paymentReceivedLight,
  },
  neutralBubble: {
    backgroundColor: Colors.surfaceSubtle,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  midCol: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
  },
  descText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  subDetail: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  refText: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  discountTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
    backgroundColor: '#FEF3C7',
    alignSelf: 'flex-start',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 3,
  },
  methodTag: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
    backgroundColor: Colors.primaryLight,
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 4,
  },
  dueDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    borderWidth: 0.5,
    borderColor: '#FCD34D',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 3,
    alignSelf: 'flex-start',
  },
  dueDateBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#92400E',
  },
  rightCol: {
    alignItems: 'flex-end',
    minWidth: 100,
  },
  amountText: {
    fontSize: 15,
    fontWeight: '700',
  },
  saleText: {
    color: Colors.creditSale,
  },
  paymentText: {
    color: Colors.paymentReceived,
  },
  neutralText: {
    color: Colors.textPrimary,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 3,
  },
  balanceLabel: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  balanceValue: {
    fontSize: 11,
    fontWeight: '700',
  },
  dueText: {
    color: Colors.creditSaleText,
  },
  advanceText: {
    color: Colors.advanceBalance,
  },
  zeroText: {
    color: Colors.paymentReceivedText,
  },
});
