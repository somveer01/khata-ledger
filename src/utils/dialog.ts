import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirmation dialog that works reliably on both Web and Mobile.
 * On Web: uses window.confirm.
 * On Native: uses Alert.alert with multi-buttons.
 */
export const confirmAction = (
  title: string,
  message: string,
  onConfirm: () => void | Promise<void>,
  confirmText: string = 'OK',
  cancelText: string = 'Cancel'
): void => {
  if (Platform.OS === 'web') {
    const ok = window.confirm(`${title}\n\n${message}`);
    if (ok) {
      void onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: cancelText, style: 'cancel' },
    {
      text: confirmText,
      style: 'destructive',
      onPress: () => {
        void onConfirm();
      },
    },
  ]);
};

/**
 * Cross-platform simple alert with optional callback on dismissal.
 */
export const showAlert = (
  title: string,
  message?: string,
  onDismiss?: () => void
): void => {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    if (onDismiss) {
      onDismiss();
    }
    return;
  }

  Alert.alert(title, message, [
    {
      text: 'OK',
      onPress: onDismiss,
    },
  ]);
};
