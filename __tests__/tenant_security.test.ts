import { getBusinessIdFromEmail, isLegacyOwner, isSuperAdmin, LEGACY_BUSINESS_ID, LEGACY_BUSINESS_TENANT_ID } from '../src/utils/tenant';
import { DataRepository } from '../src/services/db';
import { StorageService } from '../src/services/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock Firebase
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDocs: jest.fn().mockResolvedValue({ docs: [], empty: true }),
  getDoc: jest.fn().mockResolvedValue({ exists: () => false, data: () => null }),
  setDoc: jest.fn().mockResolvedValue(undefined),
  deleteDoc: jest.fn().mockResolvedValue(undefined),
  query: jest.fn(),
  where: jest.fn(),
  serverTimestamp: jest.fn(),
}));

jest.mock('../src/services/firebase', () => ({
  db: null,
  isFirebaseConfigured: () => false,
}));

describe('Multi-Tenant Data Protection Tests', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    StorageService.clearMemoryCache();
  });

  describe('Tenant ID Derivation & Super Admin Rules', () => {
    it('maps Sukhveer strictly to LEGACY_BUSINESS_ID', () => {
      expect(getBusinessIdFromEmail('sukhveersinghkush@gmail.com')).toBe(LEGACY_BUSINESS_ID);
      expect(isLegacyOwner('sukhveersinghkush@gmail.com')).toBe(true);
    });

    it('identifies Somveer as Super Admin with unique store ID', () => {
      const somveerEmail = 'somveerkushwaha@gmail.com';
      expect(isSuperAdmin(somveerEmail)).toBe(true);
      expect(getBusinessIdFromEmail(somveerEmail)).toBe('biz_somveerkushwaha_gmail_com');
      // Admin is NOT legacy owner
      expect(isLegacyOwner(somveerEmail)).toBe(false);
    });

    it('isolates different user emails into completely separate business IDs', () => {
      const biz1 = getBusinessIdFromEmail('user1@example.com');
      const biz2 = getBusinessIdFromEmail('user2@example.com');
      expect(biz1).not.toBe(biz2);
      expect(biz1).toBe('biz_user1_example_com');
      expect(biz2).toBe('biz_user2_example_com');
    });
  });

  describe('clearAllData Security Guardrail Protection', () => {
    it('strictly forbids wiping LEGACY_BUSINESS_ID under any condition', async () => {
      await expect(DataRepository.clearAllData(LEGACY_BUSINESS_ID)).rejects.toThrow(
        /सुरक्षा प्रतिबंध.*मुख्य\/सुरक्षित स्टोर/
      );
    });

    it('strictly forbids wiping LEGACY_BUSINESS_TENANT_ID', async () => {
      await expect(DataRepository.clearAllData(LEGACY_BUSINESS_TENANT_ID)).rejects.toThrow(
        /सुरक्षा प्रतिबंध.*मुख्य\/सुरक्षित स्टोर/
      );
    });

    it('prevents an Admin from wiping another user\'s store', async () => {
      const adminEmail = 'somveerkushwaha@gmail.com';
      const otherUserBizId = 'biz_retailer_delhi_gmail_com';

      // Admin tries to clear otherUserBizId
      await expect(DataRepository.clearAllData(otherUserBizId, adminEmail)).rejects.toThrow(
        /सुरक्षा प्रतिबंध: आप केवल अपने ही स्टोर का डेटा मिटा सकते हैं/
      );
    });

    it('prevents an Admin from wiping Sukhveer\'s store even if explicitly called', async () => {
      const adminEmail = 'somveerkushwaha@gmail.com';
      await expect(DataRepository.clearAllData(LEGACY_BUSINESS_ID, adminEmail)).rejects.toThrow();
    });

    it('allows a user to wipe ONLY their own store data without touching other stores', async () => {
      const somveerEmail = 'somveerkushwaha@gmail.com';
      const somveerBizId = getBusinessIdFromEmail(somveerEmail);

      // Seed dummy data for somveer
      await StorageService.saveCustomers(somveerBizId, [
        {
          id: 'c1',
          name: 'Somveer Test Customer',
          mobile: '9999999999',
          villageId: 'v1',
          businessId: somveerBizId,
          openingBalancePaise: 10000,
          currentBalancePaise: 10000,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      // Seed dummy data for another store
      const otherBizId = 'biz_other_store_gmail_com';
      await StorageService.saveCustomers(otherBizId, [
        {
          id: 'c2',
          name: 'Protected Customer',
          mobile: '8888888888',
          villageId: 'v2',
          businessId: otherBizId,
          openingBalancePaise: 50000,
          currentBalancePaise: 50000,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      // Clear Somveer's data
      await DataRepository.clearAllData(somveerBizId, somveerEmail);

      // Verify Somveer's customers are cleared
      const somveerCustomers = await StorageService.getCustomers(somveerBizId);
      expect(somveerCustomers.length).toBe(0);

      // Verify Other store's data is 100% intact!
      const otherCustomers = await StorageService.getCustomers(otherBizId);
      expect(otherCustomers.length).toBe(1);
      expect(otherCustomers[0].name).toBe('Protected Customer');
    });
  });
});
