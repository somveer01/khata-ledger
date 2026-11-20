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

      // Also supports somveer.kushwaha@gmail.com (with dot)
      const somveerEmailWithDot = 'somveer.kushwaha@gmail.com';
      expect(isSuperAdmin(somveerEmailWithDot)).toBe(true);
      expect(getBusinessIdFromEmail(somveerEmailWithDot)).toBe('biz_somveer_kushwaha_gmail_com');
      expect(isLegacyOwner(somveerEmailWithDot)).toBe(false);
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

    it('seeds rich presentation demo data exclusively for Somveer store without touching others', async () => {
      const somveerBizId = 'biz_somveer_kushwaha_gmail_com';
      const otherBizId = 'biz_other_store_demo_isolated';

      // Seed Somveer demo data
      await DataRepository.seedSomveerDemoData(somveerBizId);

      const custs = await StorageService.getCustomers(somveerBizId);
      expect(custs.length).toBe(6);
      const vils = await StorageService.getVillages(somveerBizId);
      expect(vils.length).toBe(4);
      const prods = await StorageService.getProducts(somveerBizId);
      expect(prods.length).toBe(12);
      const txs = await StorageService.getTransactions(somveerBizId);
      expect(txs.length).toBe(18);

      // Verify other store has 0 records
      const otherCusts = await StorageService.getCustomers(otherBizId);
      expect(otherCusts.length).toBe(0);

      // Verify legacy store is protected from seeding demo data
      await expect(DataRepository.seedSomveerDemoData(LEGACY_BUSINESS_ID)).rejects.toThrow();
    });
  });

  describe('Product Catalog Tenant Isolation & Seed Purging', () => {
    it('returns empty array and does NOT auto-seed default products for a clean business', async () => {
      const tenantBizId = 'biz_sukhveer_store';
      const products = await DataRepository.getProducts(tenantBizId);
      expect(products).toEqual([]);
      expect(products.length).toBe(0);
    });

    it('purges existing prod_seed_ items automatically from local cache', async () => {
      const tenantBizId = 'biz_sukhveer_store';
      // Simulate previously polluted catalog containing both custom and seed items
      await StorageService.saveProducts(tenantBizId, [
        {
          id: 'prod_seed_1_12345',
          businessId: tenantBizId,
          brandName: 'DYCOON',
          productName: 'DYCOON 400ML',
          category: 'HERBICIDE',
          packSize: '400 ML',
          unit: 'Bottle',
          gstPercent: 18,
          billingRatePaise: 28000,
          withGstRatePaise: 33040,
          sellingRatePaise: 36500,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'prod_owner_custom_1',
          businessId: tenantBizId,
          brandName: 'IFFCO',
          productName: 'Urea 45kg',
          category: 'FERTILIZER',
          packSize: '45 KG',
          unit: 'Bag',
          gstPercent: 0,
          billingRatePaise: 26600,
          withGstRatePaise: 26600,
          sellingRatePaise: 30000,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      const products = await DataRepository.getProducts(tenantBizId);
      // Seed item must be purged; only owner custom product remains
      expect(products.length).toBe(1);
      expect(products[0].id).toBe('prod_owner_custom_1');
      expect(products[0].productName).toBe('Urea 45kg');

      // Subsequent call to storage must also reflect the cleaned catalog
      const cached = await StorageService.getProducts(tenantBizId);
      expect(cached.length).toBe(1);
      expect(cached[0].id).toBe('prod_owner_custom_1');
    });

    it('strictly isolates products across multiple business tenants', async () => {
      const biz1 = 'biz_sukhveer';
      const biz2 = 'biz_somveer';

      await DataRepository.saveProduct({
        id: 'prod_1_biz1',
        businessId: biz1,
        brandName: 'Brand 1',
        productName: 'Product 1',
        category: 'PESTICIDE',
        packSize: '1 L',
        unit: 'Bottle',
        gstPercent: 18,
        billingRatePaise: 10000,
        withGstRatePaise: 11800,
        sellingRatePaise: 14000,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await DataRepository.saveProduct({
        id: 'prod_2_biz2',
        businessId: biz2,
        brandName: 'Brand 2',
        productName: 'Product 2',
        category: 'SEED',
        packSize: '10 KG',
        unit: 'Bag',
        gstPercent: 0,
        billingRatePaise: 50000,
        withGstRatePaise: 50000,
        sellingRatePaise: 60000,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const prods1 = await DataRepository.getProducts(biz1);
      const prods2 = await DataRepository.getProducts(biz2);

      expect(prods1.length).toBe(1);
      expect(prods1[0].productName).toBe('Product 1');

      expect(prods2.length).toBe(1);
      expect(prods2[0].productName).toBe('Product 2');
    });
  });
});
