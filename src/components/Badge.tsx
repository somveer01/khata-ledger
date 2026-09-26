import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, BorderRadius, Spacing } from '../constants/theme';

interface BadgeProps {
  label: string;
  variant?: 'danger' | 'success' | 'warning' | 'info' | 'neutral';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ label, variant = 'neutral', size = 'sm' }) => {
  return (
    <View style={[styles.badge, styles[variant], styles[`size_${size}`]]}>
      <Text style={[styles.text, styles[`text_${variant}`], styles[`textSize_${size}`]]}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  size_sm: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  size_md: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  danger: {
    backgroundColor: Colors.creditSaleLight,
  },
  success: {
    backgroundColor: Colors.paymentReceivedLight,
  },
  warning: {
    backgroundColor: Colors.warningLight,
  },
  info: {
    backgroundColor: Colors.infoLight,
  },
  neutral: {
    backgroundColor: Colors.surfaceSubtle,
  },
  text: {
    fontWeight: '600',
  },
  textSize_sm: {
    fontSize: 11,
  },
  textSize_md: {
    fontSize: 13,
  },
  text_danger: {
    color: Colors.creditSaleText,
  },
  text_success: {
    color: Colors.paymentReceivedText,
  },
  text_warning: {
    color: Colors.warningText,
  },
  text_info: {
    color: Colors.primary,
  },
  text_neutral: {
    color: Colors.textSecondary,
  },
});
