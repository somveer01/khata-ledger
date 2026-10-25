import { cleanForFirestore, DataRepository } from '../src/services/db';
import { StorageService } from '../src/services/storage';
import { Product } from '../src/types';
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

describe('Product Firestore Sanitization and Save Tests', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    StorageService.clearMemoryCache();
  });

  describe('cleanForFirestore Deep Array Cleaning', () => {
    it('strips undefined fields recursively inside nested arrays of objects', () => {
      const rawPayload = {
        businessId: 'biz_default_1',
        productsCatalog: [
          {
            id: 'prod_1',
            brandName: 'PARAS',
            productName: 'Paras Gold',
            technicalName: undefined,
            casePacking: undefined,
            notes: undefined,
            billingRatePaise: 13000,
            withGstRatePaise: 15340,
            sellingRatePaise: 16000,
            nestedDetails: {
              extraNote: undefined,
              validField: 'Ok',
            },
          },
        ],
      };

      const cleaned = cleanForFirestore(rawPayload);

      // Verify no 'undefined' exists anywhere in the resulting structure
      const serialized = JSON.stringify(cleaned);
      expect(serialized).not.toContain('undefined');

      expect(cleaned.productsCatalog[0].brandName).toBe('PARAS');
      expect(cleaned.productsCatalog[0].technicalName).toBeUndefined();
      expect('technicalName' in cleaned.productsCatalog[0]).toBe(false);
      expect('casePacking' in cleaned.productsCatalog[0]).toBe(false);
      expect('notes' in cleaned.productsCatalog[0]).toBe(false);
      expect(cleaned.productsCatalog[0].nestedDetails.validField).toBe('Ok');
      expect('extraNote' in cleaned.productsCatalog[0].nestedDetails).toBe(false);
    });

    it('safely handles empty arrays and non-object array items', () => {
      const payload = {
        tags: ['tag1', 'tag2', undefined],
        emptyList: [],
      };
      const cleaned = cleanForFirestore(payload);
      expect(cleaned.tags).toEqual(['tag1', 'tag2']);
      expect(cleaned.emptyList).toEqual([]);
    });
  });

  describe('DataRepository.saveProduct', () => {
    it('successfully saves a product with optional/blank fields for Sukhveer store (biz_default_1)', async () => {
      const newProduct: Product = {
        id: 'prod_paras_1',
        businessId: 'biz_default_1',
        brandName: 'PARAS',
        productName: 'Paras Fertilizer',
        category: 'FERTILIZER',
        packSize: '50 Kg',
        unit: 'Bag',
        billingRatePaise: 13000,
        gstPercent: 18,
        withGstRatePaise: 15340,
        marginPercent: 4.3,
        sellingRatePaise: 16000,
        technicalName: '',
        casePacking: '',
        notes: '',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await DataRepository.saveProduct(newProduct);
      expect(result.success).toBe(true);

      const savedList = await StorageService.getProducts('biz_default_1');
      expect(savedList.length).toBe(1);
      expect(savedList[0].productName).toBe('Paras Fertilizer');
    });
  });
});
