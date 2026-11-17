import { Platform } from 'react-native';

let audioCtx: any = null;

/**
 * Plays a short, crisp POS barcode beep sound (880Hz high beep, 90ms duration).
 * Uses Web Audio API without needing external asset files.
 */
export const playScanBeep = (): void => {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const AudioContextClass =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new AudioContextClass();
      }

      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note

      gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.09);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.09);
    }
  } catch (err) {
    // Ignore audio autoplay restrictions gracefully
  }
};

/**
 * Triggers a short haptic vibration pulse for barcode detection confirmation.
 */
export const triggerScanVibrate = (): void => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([70]);
    }
  } catch {
    // Graceful fallback
  }
};

/**
 * Convenience method: plays beep and vibrates simultaneously.
 */
export const notifyBarcodeScanned = (): void => {
  playScanBeep();
  triggerScanVibrate();
};
