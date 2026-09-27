import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  TextInputProps, 
  StyleProp, 
  ViewStyle,
  Platform,
} from 'react-native';
import { Colors, BorderRadius, Spacing, Typography } from '../constants/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  prefix?: string;
  suffix?: string;
  rightElement?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  helperText?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  prefix,
  suffix,
  rightElement,
  containerStyle,
  helperText,
  style,
  onFocus,
  onBlur,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          isFocused ? styles.inputFocused : null,
          error ? styles.inputError : null,
        ]}
      >
        {prefix && <Text style={styles.prefix}>{prefix}</Text>}
        <TextInput
          placeholderTextColor={Colors.textMuted}
          style={[
            styles.input,
            Platform.OS === 'web' ? ({ outlineStyle: 'none', outline: 'none' } as any) : null,
            style,
          ]}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
        {suffix && <Text style={styles.suffix}>{suffix}</Text>}
        {rightElement && rightElement}
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
  inputFocused: {
    borderColor: Colors.primary,
    backgroundColor: '#FFFFFF',
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
