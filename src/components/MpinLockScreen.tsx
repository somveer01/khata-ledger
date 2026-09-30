import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';
import { useSecurity } from '../context/SecurityContext';
import { useApp } from '../context/AppContext';
import { t } from '../i18n';
import { confirmAction, showAlert } from '../utils/dialog';

export const MpinLockScreen: React.FC = () => {
  const { unlock, cooldownSeconds, resetMpin, isLocked } = useSecurity();
  const { language, user, isGuest, logout, showAuthModal } = useApp();

  const [pin, setPin] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  // Shake animation on error
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  // Keyboard support for Web
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isLocked) return;
      if (cooldownSeconds > 0) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, isLocked, cooldownSeconds]);

  const handleDigit = (digit: string) => {
    if (cooldownSeconds > 0 || isVerifying) return;
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMessage('');

      if (nextPin.length === 4) {
        verify(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    if (cooldownSeconds > 0 || isVerifying) return;
    setErrorMessage('');
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (cooldownSeconds > 0 || isVerifying) return;
    setErrorMessage('');
    setPin('');
  };

  const verify = async (pinToVerify: string) => {
    setIsVerifying(true);
    try {
      const res = await unlock(pinToVerify);
      if (!res.success) {
        triggerShake();
        setPin('');
        if (res.cooldownRemaining && res.cooldownRemaining > 0) {
          setErrorMessage(
            `${t('cooldownNotice', language)} ${res.cooldownRemaining} ${t('seconds', language)}`
          );
        } else {
          const remainingMsg =
            res.remainingAttempts !== undefined && res.remainingAttempts < 4
              ? ` (${res.remainingAttempts} प्रयास शेष)`
              : '';
          setErrorMessage(`${t('wrongMpin', language)}${remainingMsg}`);
        }
      }
    } catch {
      triggerShake();
      setPin('');
      setErrorMessage(t('wrongMpin', language));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleForgotPin = () => {
    if (user && !isGuest) {
      confirmAction(
        t('forgotMpinTitle', language),
        `${t('forgotMpinDesc', language)}\n\n(${user.email})`,
        async () => {
          await resetMpin();
          await logout();
          showAuthModal(t('authSuccessLogin', language));
        },
        'danger'
      );
    } else {
      confirmAction(
        t('forgotMpinTitle', language),
        t('forgotMpinGuestDesc', language),
        async () => {
          await resetMpin();
          showAlert(t('success', language), t('mpinDisabledSuccess', language), undefined, 'success');
        },
        'danger'
      );
    }
  };

  return (
    <View style={styles.overlay}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* Header & Lock Branding */}
          <View style={styles.headerArea}>
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={32} color={Colors.primary} />
            </View>
            <Text style={styles.appTitle}>{t('appName', language)}</Text>
            <Text style={styles.lockSubtitle}>{t('enterMpin', language)}</Text>
          </View>

          {/* 4-digit PIN Dots */}
          <Animated.View style={[styles.dotsContainer, { transform: [{ translateX: shakeAnim }] }]}>
            {[0, 1, 2, 3].map((index) => {
              const isFilled = pin.length > index;
              return (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    isFilled ? styles.dotFilled : styles.dotEmpty,
                    errorMessage ? styles.dotError : null,
                  ]}
                />
              );
            })}
          </Animated.View>

          {/* Feedback & Error / Cooldown */}
          <View style={styles.messageArea}>
            {cooldownSeconds > 0 ? (
              <View style={styles.cooldownBadge}>
                <Ionicons name="time-outline" size={16} color="#DC2626" />
                <Text style={styles.cooldownText}>
                  {t('cooldownNotice', language)} {cooldownSeconds} {t('seconds', language)}
                </Text>
              </View>
            ) : errorMessage ? (
              <Text style={styles.errorText}>{errorMessage}</Text>
            ) : isVerifying ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Text style={styles.hintText}>सुरक्षित 4-अंकों का पिन दर्ज करें</Text>
            )}
          </View>

          {/* Numeric Keypad */}
          <View style={styles.keypad}>
            {[
              ['1', '2', '3'],
              ['4', '5', '6'],
              ['7', '8', '9'],
              ['clear', '0', 'backspace'],
            ].map((row, rowIndex) => (
              <View key={rowIndex} style={styles.keypadRow}>
                {row.map((item) => {
                  if (item === 'clear') {
                    return (
                      <TouchableOpacity
                        key={item}
                        style={[styles.keyButton, styles.actionKeyButton]}
                        onPress={handleClear}
                        disabled={cooldownSeconds > 0 || isVerifying || pin.length === 0}
                        activeOpacity={0.6}
                      >
                        <Text style={styles.actionKeyText}>{t('clear', language)}</Text>
                      </TouchableOpacity>
                    );
                  }

                  if (item === 'backspace') {
                    return (
                      <TouchableOpacity
                        key={item}
                        style={[styles.keyButton, styles.actionKeyButton]}
                        onPress={handleBackspace}
                        disabled={cooldownSeconds > 0 || isVerifying || pin.length === 0}
                        activeOpacity={0.6}
                      >
                        <Ionicons name="backspace-outline" size={26} color={Colors.textPrimary} />
                      </TouchableOpacity>
                    );
                  }

                  return (
                    <TouchableOpacity
                      key={item}
                      style={styles.keyButton}
                      onPress={() => handleDigit(item)}
                      disabled={cooldownSeconds > 0 || isVerifying}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.digitText}>{item}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Forgot PIN / Reset Link */}
          <TouchableOpacity
            style={styles.forgotButton}
            onPress={handleForgotPin}
            activeOpacity={0.7}
          >
            <Ionicons name="help-circle-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.forgotText}>{t('forgotMpin', language)}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    zIndex: 99999,
    elevation: 99999,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    justifyContent: 'space-between',
    alignItems: 'center',
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  headerArea: {
    alignItems: 'center',
    marginTop: Platform.OS === 'web' ? 20 : 10,
  },
  lockBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  appTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  lockSubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    marginVertical: Spacing.md,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  dotEmpty: {
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  dotFilled: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
    transform: [{ scale: 1.15 }],
  },
  dotError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEE2E2',
  },
  messageArea: {
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  hintText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
  },
  errorText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: '#DC2626',
    textAlign: 'center',
  },
  cooldownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  cooldownText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    color: '#DC2626',
  },
  keypad: {
    width: '100%',
    paddingHorizontal: Spacing.sm,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.md,
  },
  keyButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  actionKeyButton: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  digitText: {
    fontSize: 26,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textPrimary,
  },
  actionKeyText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
  },
  forgotButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.xs,
  },
  forgotText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },
});
