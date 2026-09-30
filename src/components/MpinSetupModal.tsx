import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';
import { useSecurity } from '../context/SecurityContext';
import { useApp } from '../context/AppContext';
import { t } from '../i18n';
import { showAlert } from '../utils/dialog';

interface MpinSetupModalProps {
  visible: boolean;
  mode: 'setup' | 'change' | 'disable';
  onClose: () => void;
  onSuccess?: () => void;
}

export const MpinSetupModal: React.FC<MpinSetupModalProps> = ({
  visible,
  mode,
  onClose,
  onSuccess,
}) => {
  const { setNewMpin, changeMpin, disableMpin } = useSecurity();
  const { language } = useApp();

  // Steps:
  // For 'setup': step 1 = enter new PIN, step 2 = confirm new PIN
  // For 'change': step 0 = enter old PIN, step 1 = enter new PIN, step 2 = confirm new PIN
  // For 'disable': step 0 = enter current PIN
  const [step, setStep] = useState<number>(mode === 'setup' ? 1 : 0);
  const [oldPin, setOldPin] = useState<string>('');
  const [newPin, setNewPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  useEffect(() => {
    if (visible) {
      setStep(mode === 'setup' ? 1 : 0);
      setOldPin('');
      setNewPin('');
      setConfirmPin('');
      setErrorMessage('');
      setIsProcessing(false);
    }
  }, [visible, mode]);

  const currentEnteredPin = step === 0 ? oldPin : step === 1 ? newPin : confirmPin;

  const handleDigit = (digit: string) => {
    if (isProcessing) return;
    setErrorMessage('');

    if (step === 0) {
      if (oldPin.length < 4) {
        const val = oldPin + digit;
        setOldPin(val);
        if (val.length === 4) {
          if (mode === 'disable') {
            handleCompleteDisable(val);
          } else {
            // mode === 'change', advance to step 1
            setTimeout(() => setStep(1), 200);
          }
        }
      }
    } else if (step === 1) {
      if (newPin.length < 4) {
        const val = newPin + digit;
        setNewPin(val);
        if (val.length === 4) {
          setTimeout(() => setStep(2), 200);
        }
      }
    } else if (step === 2) {
      if (confirmPin.length < 4) {
        const val = confirmPin + digit;
        setConfirmPin(val);
        if (val.length === 4) {
          handleCompleteSetupOrChange(val);
        }
      }
    }
  };

  const handleBackspace = () => {
    if (isProcessing) return;
    setErrorMessage('');
    if (step === 0) setOldPin((prev) => prev.slice(0, -1));
    else if (step === 1) setNewPin((prev) => prev.slice(0, -1));
    else if (step === 2) setConfirmPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (isProcessing) return;
    setErrorMessage('');
    if (step === 0) setOldPin('');
    else if (step === 1) setNewPin('');
    else if (step === 2) setConfirmPin('');
  };

  const handleCompleteDisable = async (pinToDisable: string) => {
    setIsProcessing(true);
    try {
      const res = await disableMpin(pinToDisable);
      if (res.success) {
        showAlert(t('success', language), t('mpinDisabledSuccess', language), undefined, 'success');
        onSuccess?.();
        onClose();
      } else {
        setErrorMessage(t('wrongMpin', language));
        setOldPin('');
      }
    } catch {
      setErrorMessage(t('wrongMpin', language));
      setOldPin('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompleteSetupOrChange = async (confirmedPin: string) => {
    if (newPin !== confirmedPin) {
      setErrorMessage(t('mpinMismatch', language));
      setConfirmPin('');
      return;
    }

    setIsProcessing(true);
    try {
      if (mode === 'setup') {
        await setNewMpin(confirmedPin);
        showAlert(t('success', language), t('mpinSetSuccess', language), undefined, 'success');
        onSuccess?.();
        onClose();
      } else {
        // mode === 'change'
        const res = await changeMpin(oldPin, confirmedPin);
        if (res.success) {
          showAlert(t('success', language), t('mpinChangedSuccess', language), undefined, 'success');
          onSuccess?.();
          onClose();
        } else {
          setErrorMessage(t('wrongMpin', language));
          setStep(0);
          setOldPin('');
          setNewPin('');
          setConfirmPin('');
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || t('wrongMpin', language));
    } finally {
      setIsProcessing(false);
    }
  };

  let title = t('setMpin', language);
  let subtitle = t('enterNewMpin', language);

  if (step === 0) {
    title = mode === 'disable' ? t('disableMpin', language) : t('changeMpin', language);
    subtitle = t('enterCurrentMpin', language);
  } else if (step === 1) {
    title = mode === 'change' ? t('changeMpin', language) : t('setMpin', language);
    subtitle = t('enterNewMpin', language);
  } else if (step === 2) {
    title = t('confirmNewMpin', language);
    subtitle = t('confirmNewMpin', language);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header Close */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="shield-checkmark" size={24} color={Colors.primary} />
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {/* Dots Indicator */}
          <View style={styles.dotsRow}>
            {[0, 1, 2, 3].map((idx) => {
              const isFilled = currentEnteredPin.length > idx;
              return (
                <View
                  key={idx}
                  style={[
                    styles.dot,
                    isFilled ? styles.dotFilled : styles.dotEmpty,
                    errorMessage ? styles.dotError : null,
                  ]}
                />
              );
            })}
          </View>

          {/* Error Message */}
          <View style={styles.errorArea}>
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </View>

          {/* Numeric Keypad */}
          <View style={styles.keypad}>
            {[
              ['1', '2', '3'],
              ['4', '5', '6'],
              ['7', '8', '9'],
              ['clear', '0', 'backspace'],
            ].map((row, rIdx) => (
              <View key={rIdx} style={styles.keypadRow}>
                {row.map((item) => {
                  if (item === 'clear') {
                    return (
                      <TouchableOpacity
                        key={item}
                        style={[styles.keyBtn, styles.actionKeyBtn]}
                        onPress={handleClear}
                        disabled={isProcessing || currentEnteredPin.length === 0}
                      >
                        <Text style={styles.actionKeyText}>{t('clear', language)}</Text>
                      </TouchableOpacity>
                    );
                  }
                  if (item === 'backspace') {
                    return (
                      <TouchableOpacity
                        key={item}
                        style={[styles.keyBtn, styles.actionKeyBtn]}
                        onPress={handleBackspace}
                        disabled={isProcessing || currentEnteredPin.length === 0}
                      >
                        <Ionicons name="backspace-outline" size={24} color={Colors.textPrimary} />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={item}
                      style={styles.keyBtn}
                      onPress={() => handleDigit(item)}
                      disabled={isProcessing}
                    >
                      <Text style={styles.keyDigitText}>{item}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Platform.OS === 'web' ? Spacing.xl : 30,
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
    marginTop: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginVertical: Spacing.md,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
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
  errorArea: {
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  errorText: {
    fontSize: Typography.fontSize.xs,
    color: '#DC2626',
    fontWeight: Typography.fontWeight.semibold,
  },
  keypad: {
    width: '100%',
    marginTop: 4,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.sm,
  },
  keyBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionKeyBtn: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  keyDigitText: {
    fontSize: 24,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textPrimary,
  },
  actionKeyText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
  },
});
