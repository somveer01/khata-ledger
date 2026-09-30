import { SecurityService } from '../src/services/security';
import { sha256 } from '../src/utils/crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('Security & MPIN Tests', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  describe('SHA-256 Hashing', () => {
    it('correctly hashes strings with bit-for-bit standard output', () => {
      // Known test vectors for SHA-256
      // sha256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
      expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

      // sha256('1234') = 03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4
      expect(sha256('1234')).toBe('03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4');
    });
  });

  describe('MPIN Configuration & Verification', () => {
    it('reports MPIN disabled initially', async () => {
      const enabled = await SecurityService.isMpinEnabled();
      expect(enabled).toBe(false);
    });

    it('sets a 4-digit MPIN successfully', async () => {
      const success = await SecurityService.setMpin('4321');
      expect(success).toBe(true);

      const enabled = await SecurityService.isMpinEnabled();
      expect(enabled).toBe(true);

      const configured = await SecurityService.isMpinConfigured();
      expect(configured).toBe(true);
    });

    it('rejects invalid PIN formats (not 4 digits)', async () => {
      await expect(SecurityService.setMpin('123')).rejects.toThrow();
      await expect(SecurityService.setMpin('12345')).rejects.toThrow();
      await expect(SecurityService.setMpin('abcd')).rejects.toThrow();
    });

    it('verifies correct PIN successfully', async () => {
      await SecurityService.setMpin('7890');
      const res = await SecurityService.verifyMpin('7890');
      expect(res.success).toBe(true);
    });

    it('rejects incorrect PIN and counts remaining attempts', async () => {
      await SecurityService.setMpin('7890');
      const res = await SecurityService.verifyMpin('1111');
      expect(res.success).toBe(false);
      expect(res.remainingAttempts).toBe(4);
    });

    it('triggers 30-second cooldown after 5 failed attempts', async () => {
      await SecurityService.setMpin('7890');
      for (let i = 0; i < 4; i++) {
        await SecurityService.verifyMpin('0000');
      }
      // 5th attempt
      const res5 = await SecurityService.verifyMpin('0000');
      expect(res5.success).toBe(false);
      expect(res5.cooldownRemaining).toBeGreaterThan(0);
      expect(res5.cooldownRemaining).toBeLessThanOrEqual(30);

      // Attempt during cooldown fails immediately
      const lockedRes = await SecurityService.verifyMpin('7890');
      expect(lockedRes.success).toBe(false);
      expect(lockedRes.cooldownRemaining).toBeGreaterThan(0);
    });
  });

  describe('MPIN Management & Auto-Lock Timeout', () => {
    it('changes MPIN when old PIN matches', async () => {
      await SecurityService.setMpin('1111');
      const res = await SecurityService.changeMpin('1111', '2222');
      expect(res.success).toBe(true);

      // Old PIN no longer works
      const verifyOld = await SecurityService.verifyMpin('1111');
      expect(verifyOld.success).toBe(false);

      // New PIN works
      const verifyNew = await SecurityService.verifyMpin('2222');
      expect(verifyNew.success).toBe(true);
    });

    it('disables MPIN when correct PIN is provided', async () => {
      await SecurityService.setMpin('5555');
      expect(await SecurityService.isMpinEnabled()).toBe(true);

      const disableRes = await SecurityService.disableMpin('5555');
      expect(disableRes.success).toBe(true);

      expect(await SecurityService.isMpinEnabled()).toBe(false);
    });

    it('defaults auto-lock timeout to 30 seconds', async () => {
      const timeout = await SecurityService.getAutoLockTimeout();
      expect(timeout).toBe(30);
    });

    it('updates auto-lock timeout', async () => {
      await SecurityService.setAutoLockTimeout(60);
      expect(await SecurityService.getAutoLockTimeout()).toBe(60);
    });
  });
});
