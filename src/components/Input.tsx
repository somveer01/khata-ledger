import React from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  TextInputProps, 
  StyleProp, 
  ViewStyle 
} from 'react-native';
import { Colors, BorderRadius, Spacing, Typography } from '../constants/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  prefix?: string;
  suffix?: string;
  containerStyle?: StyleProp<ViewStyle>;
  helperText?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  prefix,
  suffix,
  containerStyle,
  helperText,
  style,
  ...props
}) => {
  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputWrapper, error ? styles.inputError : null]}>
        {prefix && <Text style={styles.prefix}>{prefix}</Text>}
        <TextInput
          placeholderTextColor={Colors.textMuted}
          style={[styles.input, style]}
          {...props}
        />
        {suffix && <Text style={styles.suffix}>{suffix}</Text>}
      </View>
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
  },
  inputError: {
    borderColor: Colors.creditSale,
  },
  prefix: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginRight: Spacing.xs,
  },
  suffix: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginLeft: Spacing.xs,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  errorText: {
    fontSize: 12,
    color: Colors.creditSale,
    marginTop: Spacing.xs,
  },
  helperText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
});
