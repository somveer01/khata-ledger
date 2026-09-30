import AsyncStorage from '@react-native-async-storage/async-storage';
import { sha256 } from '../utils/crypto';

const SECURITY_STORAGE_KEYS = {
  MPIN_ENABLED: '@khata_book_mpin_enabled',
  MPIN_HASH: '@khata_book_mpin_hash',
  MPIN_SALT: '@khata_book_mpin_salt',
  AUTOLOCK_TIMEOUT: '@khata_book_autolock_timeout',
  FAILED_ATTEMPTS: '@khata_book_failed_attempts',
  COOLDOWN_UNTIL: '@khata_book_cooldown_until',
};

const DEFAULT_TIMEOUT_SECONDS = 30; // Auto-lock after 30 seconds
const MAX_FAILED_ATTEMPTS = 5;
const COOLDOWN_DURATION_SECONDS = 30; // Wait 30 seconds if 5 failed attempts

function generateSalt(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export const SecurityService = {
  /**
   * Check if MPIN security is enabled by user
   */
  async isMpinEnabled(): Promise<boolean> {
    try {
      const val = await AsyncStorage.getItem(SECURITY_STORAGE_KEYS.MPIN_ENABLED);
      const hash = await AsyncStorage.getItem(SECURITY_STORAGE_KEYS.MPIN_HASH);
      return val === 'true' && !!hash;
    } catch {
      return false;
    }
  },

  /**
   * Check if an MPIN has already been set up previously
   */
  async isMpinConfigured(): Promise<boolean> {
    try {
      const hash = await AsyncStorage.getItem(SECURITY_STORAGE_KEYS.MPIN_HASH);
      return !!hash;
    } catch {
      return false;
    }
  },

  /**
   * Set new 4-digit MPIN
   */
  async setMpin(pin: string): Promise<boolean> {
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      throw new Error('PIN must be exactly 4 digits');
    }
    const salt = generateSalt();
    const hash = sha256(`${pin}_${salt}`);

    await AsyncStorage.setItem(SECURITY_STORAGE_KEYS.MPIN_SALT, salt);
    await AsyncStorage.setItem(SECURITY_STORAGE_KEYS.MPIN_HASH, hash);
    await AsyncStorage.setItem(SECURITY_STORAGE_KEYS.MPIN_ENABLED, 'true');
    await AsyncStorage.setItem(SECURITY_STORAGE_KEYS.FAILED_ATTEMPTS, '0');
    await AsyncStorage.removeItem(SECURITY_STORAGE_KEYS.COOLDOWN_UNTIL);
    return true;
  },

  /**
   * Check remaining cooldown seconds, if any
   */
  async getCooldownRemaining(): Promise<number> {
    try {
      const cooldownUntilStr = await AsyncStorage.getItem(SECURITY_STORAGE_KEYS.COOLDOWN_UNTIL);
      if (!cooldownUntilStr) return 0;
      const cooldownUntil = parseInt(cooldownUntilStr, 10);
      const remainingMs = cooldownUntil - Date.now();
      if (remainingMs > 0) {
        return Math.ceil(remainingMs / 1000);
      }
      // Cooldown expired
      await AsyncStorage.removeItem(SECURITY_STORAGE_KEYS.COOLDOWN_UNTIL);
      await AsyncStorage.setItem(SECURITY_STORAGE_KEYS.FAILED_ATTEMPTS, '0');
      return 0;
    } catch {
      return 0;
    }
  },

  /**
   * Verify entered 4-digit MPIN
   */
  async verifyMpin(pin: string): Promise<{ success: boolean; cooldownRemaining?: number; remainingAttempts?: number }> {
    const cooldownRemaining = await this.getCooldownRemaining();
    if (cooldownRemaining > 0) {
      return { success: false, cooldownRemaining };
    }

    const salt = await AsyncStorage.getItem(SECURITY_STORAGE_KEYS.MPIN_SALT);
    const storedHash = await AsyncStorage.getItem(SECURITY_STORAGE_KEYS.MPIN_HASH);

    if (!salt || !storedHash) {
      // No MPIN configured
      return { success: true };
    }

    const enteredHash = sha256(`${pin}_${salt}`);
    if (enteredHash === storedHash) {
      // Success: reset failed attempts
      await AsyncStorage.setItem(SECURITY_STORAGE_KEYS.FAILED_ATTEMPTS, '0');
      await AsyncStorage.removeItem(SECURITY_STORAGE_KEYS.COOLDOWN_UNTIL);
      return { success: true };
    }

    // Failed attempt
    const failedRaw = await AsyncStorage.getItem(SECURITY_STORAGE_KEYS.FAILED_ATTEMPTS);
    const failed = (failedRaw ? parseInt(failedRaw, 10) : 0) + 1;
    await AsyncStorage.setItem(SECURITY_STORAGE_KEYS.FAILED_ATTEMPTS, failed.toString());

    if (failed >= MAX_FAILED_ATTEMPTS) {
      const cooldownUntil = Date.now() + COOLDOWN_DURATION_SECONDS * 1000;
      await AsyncStorage.setItem(SECURITY_STORAGE_KEYS.COOLDOWN_UNTIL, cooldownUntil.toString());
      return { success: false, cooldownRemaining: COOLDOWN_DURATION_SECONDS, remainingAttempts: 0 };
    }

    return { success: false, remainingAttempts: MAX_FAILED_ATTEMPTS - failed };
  },

  /**
   * Change MPIN
   */
  async changeMpin(oldPin: string, newPin: string): Promise<{ success: boolean; error?: string }> {
    const verifyRes = await this.verifyMpin(oldPin);
    if (!verifyRes.success) {
      return { success: false, error: 'INCORRECT_OLD_PIN' };
    }
    if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      return { success: false, error: 'INVALID_NEW_PIN' };
    }
    await this.setMpin(newPin);
    return { success: true };
  },

  /**
   * Disable MPIN
   */
  async disableMpin(currentPin: string): Promise<{ success: boolean; error?: string }> {
    const verifyRes = await this.verifyMpin(currentPin);
    if (!verifyRes.success) {
      return { success: false, error: 'INCORRECT_PIN' };
    }
    await AsyncStorage.setItem(SECURITY_STORAGE_KEYS.MPIN_ENABLED, 'false');
    return { success: true };
  },

  /**
   * Force reset MPIN (used when account password is verified or emergency reset)
   */
  async forceResetMpin(): Promise<void> {
    await AsyncStorage.setItem(SECURITY_STORAGE_KEYS.MPIN_ENABLED, 'false');
    await AsyncStorage.removeItem(SECURITY_STORAGE_KEYS.MPIN_HASH);
    await AsyncStorage.removeItem(SECURITY_STORAGE_KEYS.MPIN_SALT);
    await AsyncStorage.setItem(SECURITY_STORAGE_KEYS.FAILED_ATTEMPTS, '0');
    await AsyncStorage.removeItem(SECURITY_STORAGE_KEYS.COOLDOWN_UNTIL);
  },

  /**
   * Get Auto-Lock Timeout in seconds (default: 30)
   */
  async getAutoLockTimeout(): Promise<number> {
    try {
      const raw = await AsyncStorage.getItem(SECURITY_STORAGE_KEYS.AUTOLOCK_TIMEOUT);
      return raw ? parseInt(raw, 10) : DEFAULT_TIMEOUT_SECONDS;
    } catch {
      return DEFAULT_TIMEOUT_SECONDS;
    }
  },

  /**
   * Set Auto-Lock Timeout in seconds
   */
  async setAutoLockTimeout(seconds: number): Promise<void> {
    await AsyncStorage.setItem(SECURITY_STORAGE_KEYS.AUTOLOCK_TIMEOUT, seconds.toString());
  },
};
