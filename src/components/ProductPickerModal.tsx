import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';
import { useApp } from '../context/AppContext';
import { DataRepository } from '../services/db';
import { Product, ProductCategory } from '../types';
import { formatCurrency, toRupees } from '../utils/money';

interface ProductPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectProduct: (product: Product) => void;
  selectedProductId?: string;
  onAddNewProduct?: () => void;
}

const CATEGORY_TABS: { key: string; labelHi: string; labelEn: string }[] = [
  { key: 'ALL', labelHi: 'सभी', labelEn: 'All' },
  { key: 'PESTICIDE', labelHi: 'कीटनाशक', labelEn: 'Pesticide' },
  { key: 'INSECTICIDE', labelHi: 'इन्सेक्टिसाइड', labelEn: 'Insecticide' },
  { key: 'FUNGICIDE', labelHi: 'फफूंदनाशक', labelEn: 'Fungicide' },
  { key: 'HERBICIDE', labelHi: 'खरपतवार', labelEn: 'Herbicide' },
  { key: 'SEED', labelHi: 'बीज (Seed)', labelEn: 'Seed' },
  { key: 'FERTILIZER', labelHi: 'खाद', labelEn: 'Fertilizer' },
  { key: 'OTHER', labelHi: 'अन्य', labelEn: 'Other' },
];

export const ProductPickerModal: React.FC<ProductPickerModalProps> = ({
  visible,
  onClose,
  onSelectProduct,
  selectedProductId,
  onAddNewProduct,
}) => {
  const { business, language } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');

  useEffect(() => {
    if (visible && business) {
      setLoading(true);
      DataRepository.getProducts(business.id)
        .then((list) => setProducts(list))
        .catch((err) => console.warn('ProductPickerModal load error:', err))
        .finally(() => setLoading(false));
    }
  }, [visible, business]);

  // Distinct brand list
  const brandList = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.brandName && p.brandName.trim()) {
        set.add(p.brandName.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    let list = [...products];

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.productName.toLowerCase().includes(q) ||
          p.brandName.toLowerCase().includes(q) ||
          (p.technicalName && p.technicalName.toLowerCase().includes(q)) ||
          p.packSize.toLowerCase().includes(q)
      );
    }

    if (selectedCategory !== 'ALL') {
      list = list.filter((p) => p.category === selectedCategory);
    }

    if (selectedBrand !== 'ALL') {
      list = list.filter((p) => p.brandName.trim().toLowerCase() === selectedBrand.toLowerCase());
    }

    list.sort((a, b) => a.productName.localeCompare(b.productName));
    return list;
  }, [products, search, selectedCategory, selectedBrand]);

  const renderProductItem = ({ item }: { item: Product }) => {
    const isSelected = item.id === selectedProductId;
    const sellingRupees = toRupees(item.sellingRatePaise);

    return (
      <TouchableOpacity
        style={[styles.productCard, isSelected && styles.productCardSelected]}
        onPress={() => {
          onSelectProduct(item);
          onClose();
        }}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeaderRow}>
          <View style={styles.titleCol}>
            <View style={styles.nameAndBadgeRow}>
              <Text style={styles.productName} numberOfLines={1}>
                {item.productName}
              </Text>
              {item.brandName ? (
                <View style={styles.brandBadge}>
                  <Text style={styles.brandBadgeText}>{item.brandName}</Text>
                </View>
              ) : null}
            </View>

            {item.technicalName ? (
              <Text style={styles.technicalName} numberOfLines={1}>
                🧪 {item.technicalName}
              </Text>
            ) : null}
          </View>

          {isSelected ? (
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          )}
        </View>

        {/* Details & Rate Strip */}
        <View style={styles.rateRow}>
          <View style={styles.packBadge}>
            <Ionicons name="cube-outline" size={12} color={Colors.textSecondary} />
            <Text style={styles.packBadgeText}>
              {item.packSize || '-'} {item.unit ? `(${item.unit})` : ''}
            </Text>
          </View>

          <View style={{ flex: 1 }} />

          <View style={styles.sellingRateBox}>
            <Text style={styles.sellingRateLabel}>
              {language === 'hi' ? 'विक्रय दर' : 'Selling Rate'}:
            </Text>
            <Text style={styles.sellingRateValue}>
              ₹{sellingRupees.toLocaleString('en-IN')}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Ionicons name="cube" size={20} color={Colors.primary} />
              </View>
              <View>
                <Text style={styles.title}>
                  {language === 'hi' ? 'सामान चुनें (Rate Master)' : 'Select Product (Rate Master)'}
                </Text>
                <Text style={styles.subtitle}>
                  {language === 'hi'
                    ? `${filteredProducts.length} उत्पाद उपलब्ध • चुनते ही दर भर जाएगी`
                    : `${filteredProducts.length} products available`}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Search Box */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={Colors.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder={
                language === 'hi'
                  ? 'उत्पाद का नाम, ब्रांड या केमिकल खोजें...'
                  : 'Search product, brand or chemical...'
              }
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Category Filter Chips */}
          <View style={styles.filterSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsScroll}
            >
              {CATEGORY_TABS.map((cat) => {
                const active = selectedCategory === cat.key;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    style={[styles.filterChip, active && styles.activeFilterChip]}
                    onPress={() => setSelectedCategory(cat.key)}
                  >
                    <Text style={[styles.filterChipText, active && styles.activeFilterChipText]}>
                      {language === 'hi' ? cat.labelHi : cat.labelEn}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Brand Filter Chips (if more than 1 brand) */}
          {brandList.length > 0 && (
            <View style={styles.brandFilterSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsScroll}
              >
                <TouchableOpacity
                  style={[styles.brandChip, selectedBrand === 'ALL' && styles.activeBrandChip]}
                  onPress={() => setSelectedBrand('ALL')}
                >
                  <Text style={[styles.brandChipText, selectedBrand === 'ALL' && styles.activeBrandChipText]}>
                    {language === 'hi' ? 'सभी ब्रांड' : 'All Brands'}
                  </Text>
                </TouchableOpacity>

                {brandList.map((brand) => {
                  const active = selectedBrand.toLowerCase() === brand.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={brand}
                      style={[styles.brandChip, active && styles.activeBrandChip]}
                      onPress={() => setSelectedBrand(brand)}
                    >
                      <Text style={[styles.brandChipText, active && styles.activeBrandChipText]}>
                        {brand}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Product List */}
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>
                {language === 'hi' ? 'उत्पाद लोड हो रहे हैं...' : 'Loading products...'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredProducts}
              keyExtractor={(item) => item.id}
              renderItem={renderProductItem}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="cube-outline" size={48} color={Colors.textMuted} />
                  <Text style={styles.emptyTitle}>
                    {language === 'hi' ? 'कोई उत्पाद नहीं मिला' : 'No products found'}
                  </Text>
                  <Text style={styles.emptySub}>
                    {language === 'hi'
                      ? 'फ़िल्टर बदलें या नया उत्पाद जोड़ें।'
                      : 'Try changing search or filters.'}
                  </Text>
                  {onAddNewProduct && (
                    <TouchableOpacity
                      style={styles.addNewBtn}
                      onPress={() => {
                        onClose();
                        onAddNewProduct();
                      }}
                    >
                      <Ionicons name="add-circle" size={18} color="#FFFFFF" />
                      <Text style={styles.addNewBtnText}>
                        {language === 'hi' ? '+ नया उत्पाद दर्ज करें' : '+ Add New Product'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              }
            />
          )}

          {/* Footer Close Button */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.closeFooterBtn} onPress={onClose}>
              <Text style={styles.closeFooterText}>
                {language === 'hi' ? 'बंद करें' : 'Close'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '92%',
    height: '88%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: BorderRadius.full,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  filterSection: {
    marginTop: Spacing.sm,
  },
  brandFilterSection: {
    marginTop: 4,
    marginBottom: Spacing.xs,
  },
  chipsScroll: {
    paddingHorizontal: Spacing.lg,
    gap: 6,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  activeFilterChip: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activeFilterChipText: {
    color: '#FFFFFF',
  },
  brandChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  activeBrandChip: {
    backgroundColor: '#1E293B',
    borderColor: '#1E293B',
  },
  brandChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  activeBrandChipText: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    gap: 8,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  productCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#F0F9FF',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleCol: {
    flex: 1,
    marginRight: 8,
  },
  nameAndBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  brandBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  brandBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  technicalName: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  packBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  packBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  sellingRateBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  sellingRateLabel: {
    fontSize: 11,
    color: '#166534',
    fontWeight: '600',
  },
  sellingRateValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#15803D',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.sm,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.md,
  },
  emptySub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  addNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
  },
  addNewBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
  },
  closeFooterBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  closeFooterText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
});
