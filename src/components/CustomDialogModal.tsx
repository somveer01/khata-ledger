import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';
import { DialogOptions, setDialogListener } from '../utils/dialog';

export const CustomDialogModal: React.FC = () => {
  const [config, setConfig] = useState<DialogOptions | null>(null);
  const [scaleAnim] = useState(new Animated.Value(0.92));
  const [opacityAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    setDialogListener((dialog) => {
      if (dialog) {
        setConfig(dialog);
        Animated.parallel([
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 7,
            tension: 65,
            useNativeDriver: true,
          }),
        ]).start();
      } else {
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }).start(() => {
          setConfig(null);
          scaleAnim.setValue(0.92);
        });
      }
    });

    return () => {
      setDialogListener(null);
    };
  }, [opacityAnim, scaleAnim]);

  if (!config) return null;

  const handleDismiss = () => {
    const onDismiss = config.onDismiss;
    const onCancel = config.onCancel;
    setConfig(null);
    if (onDismiss) onDismiss();
    else if (onCancel) onCancel();
  };

  const handleConfirm = async () => {
    const onConfirm = config.onConfirm;
    setConfig(null);
    if (onConfirm) {
      await onConfirm();
    }
  };

  const type = config.type || 'info';

  const getIconConfig = () => {
    switch (type) {
      case 'success':
        return {
          icon: 'checkmark-circle' as const,
          color: '#16A34A',
          bgColor: '#DCFCE7',
          btnColor: Colors.primary,
        };
      case 'danger':
        return {
          icon: 'alert-circle' as const,
          color: '#DC2626',
          bgColor: '#FEE2E2',
          btnColor: '#DC2626',
        };
      case 'logout':
        return {
          icon: 'log-out-outline' as const,
          color: Colors.primary,
          bgColor: '#DBEAFE',
          btnColor: '#DC2626',
        };
      case 'warning':
        return {
          icon: 'warning' as const,
          color: '#D97706',
          bgColor: '#FEF3C7',
          btnColor: Colors.primary,
        };
      case 'info':
      default:
        return {
          icon: 'information-circle' as const,
          color: Colors.primary,
          bgColor: '#EFF6FF',
          btnColor: Colors.primary,
        };
    }
  };

  const iconInfo = getIconConfig();

  return (
    <Modal
      transparent
      visible={!!config}
      animationType="none"
      onRequestClose={handleDismiss}
    >
      <TouchableWithoutFeedback onPress={handleDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View
              style={[
                styles.modalCard,
                {
                  opacity: opacityAnim,
                  transform: [{ scale: scaleAnim }],
                },
              ]}
            >
              {/* Top Icon Badge */}
              <View style={[styles.iconBadge, { backgroundColor: iconInfo.bgColor }]}>
                <Ionicons name={iconInfo.icon} size={32} color={iconInfo.color} />
              </View>

              {/* Title */}
              <Text style={styles.title}>{config.title}</Text>

              {/* Message */}
              {config.message ? (
                <Text style={styles.message}>{config.message}</Text>
              ) : null}

              {/* Action Buttons */}
              <View style={styles.buttonRow}>
                {config.isConfirm ? (
                  <>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={handleDismiss}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cancelButtonText}>
                        {config.cancelText || 'Cancel'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.confirmButton, { backgroundColor: iconInfo.btnColor }]}
                      onPress={handleConfirm}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.confirmButtonText}>
                        {config.confirmText || 'Confirm'}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={[styles.singleButton, { backgroundColor: iconInfo.btnColor }]}
                    onPress={handleDismiss}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.singleButtonText}>
                      {config.confirmText || 'OK'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl + 4,
    paddingBottom: Spacing.xl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.h3,
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  message: {
    ...Typography.body,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.xs,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: BorderRadius.md,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelButtonText: {
    ...Typography.bodyBold,
    color: '#475569',
    fontSize: 14,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  confirmButtonText: {
    ...Typography.bodyBold,
    color: '#FFFFFF',
    fontSize: 14,
  },
  singleButton: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  singleButtonText: {
    ...Typography.bodyBold,
    color: '#FFFFFF',
    fontSize: 15,
  },
});
