import { Alert, Platform } from 'react-native';

export type DialogType = 'info' | 'success' | 'warning' | 'danger' | 'logout';

export interface DialogOptions {
  title: string;
  message?: string;
  type?: DialogType;
  isConfirm?: boolean;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  onDismiss?: () => void;
}

type DialogListener = (dialog: DialogOptions | null) => void;

let activeListener: DialogListener | null = null;

export const setDialogListener = (listener: DialogListener | null) => {
  activeListener = listener;
};

/**
 * Primary dialog trigger that renders the beautiful in-app CustomDialogModal.
 * If the modal component is not mounted yet, it falls back to native/browser alerts.
 */
export const showDialog = (options: DialogOptions): void => {
  if (activeListener) {
    activeListener(options);
    return;
  }

  // Graceful fallback if modal is not mounted yet
  if (options.isConfirm) {
    if (Platform.OS === 'web') {
      const ok = window.confirm(options.message ? `${options.title}\n\n${options.message}` : options.title);
      if (ok && options.onConfirm) {
        void options.onConfirm();
      } else if (!ok && options.onCancel) {
        options.onCancel();
      }
    } else {
      Alert.alert(options.title, options.message, [
        {
          text: options.cancelText || 'Cancel',
          style: 'cancel',
          onPress: options.onCancel,
        },
        {
          text: options.confirmText || 'OK',
          style: options.type === 'danger' || options.type === 'logout' ? 'destructive' : 'default',
          onPress: () => {
            if (options.onConfirm) void options.onConfirm();
          },
        },
      ]);
    }
  } else {
    if (Platform.OS === 'web') {
      window.alert(options.message ? `${options.title}\n\n${options.message}` : options.title);
      if (options.onDismiss) options.onDismiss();
    } else {
      Alert.alert(options.title, options.message, [
        {
          text: options.confirmText || 'OK',
          onPress: options.onDismiss,
        },
      ]);
    }
  }
};

/**
 * Cross-platform confirmation dialog that renders a rich in-app popup modal.
 */
export const confirmAction = (
  title: string,
  message: string,
  onConfirm: () => void | Promise<void>,
  confirmText: string = 'OK',
  cancelText: string = 'Cancel',
  type?: DialogType
): void => {
  let deducedType: DialogType = type || 'warning';
  const lower = (title + ' ' + message + ' ' + confirmText).toLowerCase();
  if (
    lower.includes('delete') ||
    lower.includes('हटाएं') ||
    lower.includes('मिटाएं') ||
    lower.includes('clear') ||
    lower.includes('danger')
  ) {
    deducedType = 'danger';
  } else if (lower.includes('logout') || lower.includes('लॉगआउट')) {
    deducedType = 'logout';
  }

  showDialog({
    title,
    message,
    type: deducedType,
    isConfirm: true,
    confirmText,
    cancelText,
    onConfirm,
  });
};

/**
 * Cross-platform alert popup with styled in-app presentation.
 */
export const showAlert = (
  title: string,
  message?: string,
  onDismiss?: () => void,
  type?: DialogType
): void => {
  let deducedType: DialogType = type || 'info';
  const lower = (title + ' ' + (message || '')).toLowerCase();
  if (
    lower.includes('success') ||
    lower.includes('सफल') ||
    lower.includes('अपडेट') ||
    lower.includes('सुरक्षित')
  ) {
    deducedType = 'success';
  } else if (
    lower.includes('error') ||
    lower.includes('गलती') ||
    lower.includes('त्रुटि') ||
    lower.includes('cannot') ||
    lower.includes('नहीं') ||
    lower.includes('fail')
  ) {
    deducedType = 'danger';
  }

  showDialog({
    title,
    message,
    type: deducedType,
    isConfirm: false,
    confirmText: 'OK',
    onDismiss,
  });
};
