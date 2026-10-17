import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { DataRepository } from '../../services/db';
import { Product, ProductCategory } from '../../types';
import { formatCurrency, toRupees } from '../../utils/money';
import { confirmAction, showAlert } from '../../utils/dialog';

const CATEGORY_TABS: { key: string; labelHi: string; labelEn: string; icon: string }[] = [
  { key: 'ALL', labelHi: 'सभी उत्पाद', labelEn: 'All', icon: 'apps-outline' },
  { key: 'PESTICIDE', labelHi: 'कीटनाशक', labelEn: 'Pesticide', icon: 'shield-outline' },
  { key: 'INSECTICIDE', labelHi: 'इन्सेक्टिसाइड', labelEn: 'Insecticide', icon: 'bug-outline' },
  { key: 'FUNGICIDE', labelHi: 'फफूंदनाशक', labelEn: 'Fungicide', icon: 'flask-outline' },
  { key: 'HERBICIDE', labelHi: 'खरपतवारनाशक', labelEn: 'Herbicide', icon: 'leaf-outline' },
  { key: 'SEED', labelHi: 'बीज (Seeds)', labelEn: 'Seeds', icon: 'nutrition-outline' },
  { key: 'FERTILIZER', labelHi: 'खाद (Fertilizer)', labelEn: 'Fertilizer', icon: 'cube-outline' },
  { key: 'OTHER', labelHi: 'अन्य', labelEn: 'Other', icon: 'ellipsis-horizontal-outline' },
];

export const ProductListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { business, language, guardAction, dataVersion } = useApp();

  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<'NAME' | 'SELLING_RATE' | 'MARGIN'>('NAME');

  const loadData = useCallback(async (force = false) => {
    if (!business) return;
    const list = await DataRepository.getProducts(business.id, force);
    setProducts(list);
  }, [business]);

  useEffect(() => {
    loadData();
  }, [loadData, dataVersion]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  };

  const handleDeleteProduct = (prod: Product) => {
    if (!business) return;
    confirmAction(
      language === 'hi' ? 'उत्पाद हटाएं' : 'Delete Product',
      language === 'hi'
        ? `क्या आप सचमुच "${prod.productName}" को हटाना चाहते हैं?`
        : `Are you sure you want to delete "${prod.productName}"?`,
      async () => {
        const res = await DataRepository.deleteProduct(business.id, prod.id);
        if (res.success) {
          showAlert(
            language === 'hi' ? 'सफल' : 'Success',
            language === 'hi' ? 'उत्पाद सफलतापूर्वक हटा दिया गया।' : 'Product deleted successfully.',
            undefined,
            'success'
          );
          loadData();
        } else {
          showAlert(language === 'hi' ? 'त्रुटि' : 'Error', res.error || 'Failed to delete', undefined, 'danger');
        }
      },
      language === 'hi' ? 'हटाएं' : 'Delete',
      language === 'hi' ? 'रद्द करें' : 'Cancel',
      'danger'
    );
  };

  // Distinct brand list for brand filter chips
  const brandList = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.brandName && p.brandName.trim()) {
        set.add(p.brandName.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  // Filtered & Sorted products
  const filteredProducts = useMemo(() => {
    let list = [...products];

    // Search query
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

    // Category filter
    if (selectedCategory !== 'ALL') {
      list = list.filter((p) => p.category === selectedCategory);
    }

    // Brand filter
    if (selectedBrand !== 'ALL') {
      list = list.filter((p) => p.brandName.trim().toLowerCase() === selectedBrand.toLowerCase());
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'SELLING_RATE') {
        return (b.sellingRatePaise || 0) - (a.sellingRatePaise || 0);
      } else if (sortBy === 'MARGIN') {
        return (b.marginPercent || 0) - (a.marginPercent || 0);
      } else {
        return a.productName.localeCompare(b.productName);
      }
    });

    return list;
  }, [products, search, selectedCategory, selectedBrand, sortBy]);

  const renderProductItem = ({ item }: { item: Product }) => {
    const billingRupees = toRupees(item.billingRatePaise);
    const withGstRupees = toRupees(item.withGstRatePaise);
    const sellingRupees = toRupees(item.sellingRatePaise);
    const profitPerUnit = sellingRupees - withGstRupees;
    const margin = item.marginPercent || (withGstRupees > 0 ? Math.round(((profitPerUnit / withGstRupees) * 100) * 10) / 10 : 0);

    return (
      <Card style={styles.productCard}>
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={styles.badgeAndNameCol}>
            <View style={styles.brandRow}>
              <View style={styles.brandBadge}>
                <Text style={styles.brandBadgeText}>{item.brandName}</Text>
              </View>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{item.category}</Text>
              </View>
            </View>

            <Text style={styles.productTitle}>{item.productName}</Text>
            {item.technicalName ? (
              <Text style={styles.technicalText} numberOfLines={2}>
                🧪 {item.technicalName}
              </Text>
            ) : null}

            <View style={styles.packRow}>
              <View style={styles.packPill}>
                <Ionicons name="cube-outline" size={12} color={Colors.textSecondary} />
                <Text style={styles.packText}>{item.packSize}</Text>
              </View>
              {item.casePacking ? (
                <Text style={styles.caseText}>• {item.casePacking}</Text>
              ) : null}
            </View>
          </View>

          {/* Action buttons (Edit & Delete) */}
          <View style={styles.actionCol}>
            <TouchableOpacity
              onPress={() =>
                guardAction(() => navigation.navigate('AddEditProduct', { product: item }))
              }
              style={styles.editBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="pencil" size={15} color={Colors.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => guardAction(() => handleDeleteProduct(item))}
              style={styles.deleteBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={15} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 3-Rate Display Grid */}
        <View style={styles.ratesContainer}>
          {/* Billing Rate (Without GST) */}
          <View style={styles.rateBox}>
            <Text style={styles.rateBoxLabel}>{language === 'hi' ? 'खरीद (बिना GST)' : 'Buy (No GST)'}</Text>
            <Text style={styles.rateBoxVal}>{formatCurrency(item.billingRatePaise)}</Text>
          </View>

          {/* With GST Rate */}
          <View style={[styles.rateBox, styles.rateBoxWithGst]}>
            <Text style={styles.rateBoxLabel}>
              {language === 'hi' ? `खरीद (+${item.gstPercent}% GST)` : `With GST (${item.gstPercent}%)`}
            </Text>
            <Text style={[styles.rateBoxVal, { color: Colors.textPrimary }]}>
              {formatCurrency(item.withGstRatePaise)}
            </Text>
          </View>

          {/* Selling Price */}
          <View style={[styles.rateBox, styles.rateBoxSelling]}>
            <Text style={[styles.rateBoxLabel, { color: '#166534' }]}>
              {language === 'hi' ? 'बिक्री दर (Selling)' : 'Selling Rate'}
            </Text>
            <Text style={[styles.rateBoxVal, styles.rateBoxSellingVal]}>
              {formatCurrency(item.sellingRatePaise)}
            </Text>
          </View>
        </View>

        {/* Profit Margin Strip */}
        <View style={styles.marginStrip}>
          <View style={styles.marginInfoRow}>
            <Ionicons
              name={profitPerUnit >= 0 ? 'trending-up' : 'trending-down'}
              size={14}
              color={profitPerUnit >= 0 ? '#16A34A' : Colors.danger}
            />
            <Text style={styles.marginLabel}>
              {language === 'hi' ? 'मुनाफा / मार्जिन:' : 'Profit / Margin:'}{' '}
              <Text
                style={[
                  styles.marginVal,
                  { color: profitPerUnit >= 0 ? '#16A34A' : Colors.danger },
                ]}
              >
                +{formatCurrency(toRupees(profitPerUnit) * 100)}/नग ({margin}%)
              </Text>
            </Text>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.screen}>
      <Header
        title={language === 'hi' ? 'उत्पाद रेट मास्टर' : 'Product Rate Master'}
        subtitle={`${filteredProducts.length} ${language === 'hi' ? 'उत्पाद उपलब्ध' : 'products'}`}
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity
            style={styles.headerAddBtn}
            onPress={() => guardAction(() => navigation.navigate('AddEditProduct'))}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.headerAddBtnText}>{language === 'hi' ? 'नया उत्पाद' : 'Add'}</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.container}>
        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textSecondary} />
          <TextInput
            placeholder={
              language === 'hi'
                ? 'ब्रांड, उत्पाद, टेक्निकल नाम से खोजें...'
                : 'Search brand, product or chemical...'
            }
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            style={[
              styles.searchInput,
              Platform.OS === 'web' ? ({ outlineStyle: 'none', outline: 'none' } as any) : null,
            ]}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Category Horizontal Filter Chips */}
        <View style={styles.chipsContainer}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={CATEGORY_TABS}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.categoryChipsList}
            renderItem={({ item }) => {
              const isSelected = selectedCategory === item.key;
              return (
                <TouchableOpacity
                  style={[styles.chip, isSelected && styles.chipActive]}
                  onPress={() => setSelectedCategory(item.key)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={14}
                    color={isSelected ? '#FFFFFF' : Colors.textSecondary}
                  />
                  <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                    {language === 'hi' ? item.labelHi : item.labelEn}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Brand Horizontal Filter Chips */}
        {brandList.length > 0 && (
          <View style={styles.brandChipsContainer}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={['ALL', ...brandList]}
              keyExtractor={(item) => item}
              contentContainerStyle={styles.brandChipsList}
              renderItem={({ item }) => {
                const isSelected = selectedBrand === item;
                return (
                  <TouchableOpacity
                    style={[styles.brandChip, isSelected && styles.brandChipActive]}
                    onPress={() => setSelectedBrand(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.brandChipText, isSelected && styles.brandChipTextActive]}>
                      {item === 'ALL' ? (language === 'hi' ? 'सभी ब्रांड' : 'All Brands') : item}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}

        {/* Sort Bar */}
        <View style={styles.sortBar}>
          <Text style={styles.resultCountText}>
            {filteredProducts.length} {language === 'hi' ? 'उत्पाद मिले' : 'Products'}
          </Text>

          <View style={styles.sortButtonsRow}>
            <TouchableOpacity
              style={[styles.sortBtn, sortBy === 'NAME' && styles.sortBtnActive]}
              onPress={() => setSortBy('NAME')}
            >
              <Text style={[styles.sortBtnText, sortBy === 'NAME' && styles.sortBtnTextActive]}>
                A-Z
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sortBtn, sortBy === 'SELLING_RATE' && styles.sortBtnActive]}
              onPress={() => setSortBy('SELLING_RATE')}
            >
              <Text style={[styles.sortBtnText, sortBy === 'SELLING_RATE' && styles.sortBtnTextActive]}>
                {language === 'hi' ? 'भाव ₹' : 'Rate'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sortBtn, sortBy === 'MARGIN' && styles.sortBtnActive]}
              onPress={() => setSortBy('MARGIN')}
            >
              <Text style={[styles.sortBtnText, sortBy === 'MARGIN' && styles.sortBtnTextActive]}>
                {language === 'hi' ? 'मुनाफा %' : 'Margin %'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Product List */}
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          renderItem={renderProductItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title={language === 'hi' ? 'कोई उत्पाद नहीं मिला' : 'No Products Found'}
              description={
                language === 'hi'
                  ? 'अपनी खोज बदलें या नया उत्पाद जोड़ें।'
                  : 'Try changing your search filters or add a new product.'
              }
              actionTitle={language === 'hi' ? '+ नया उत्पाद जोड़ें' : '+ Add New Product'}
              onAction={() => guardAction(() => navigation.navigate('AddEditProduct'))}
            />
          }
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  headerAddBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    height: 42,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
    height: '100%',
  },
  chipsContainer: {
    marginTop: Spacing.xs,
  },
  categoryChipsList: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  brandChipsContainer: {
    marginTop: 0,
  },
  brandChipsList: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 4,
    gap: 6,
  },
  brandChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  brandChipActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#3B82F6',
  },
  brandChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  brandChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 4,
  },
  resultCountText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  sortButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sortBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sortBtnActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  sortBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  sortBtnTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: 80,
  },
  productCard: {
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  badgeAndNameCol: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  brandBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  brandBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
  },
  categoryBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  categoryBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  productTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  technicalText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  packRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  packPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  packText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  caseText: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  actionCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editBtn: {
    padding: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight,
  },
  deleteBtn: {
    padding: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: '#FEE2E2',
  },
  ratesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.md,
    padding: 8,
    marginTop: Spacing.sm,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rateBox: {
    flex: 1,
    alignItems: 'center',
  },
  rateBoxWithGst: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 4,
  },
  rateBoxSelling: {
    backgroundColor: '#F0FDF4',
    borderRadius: BorderRadius.sm,
    paddingVertical: 2,
  },
  rateBoxLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 2,
    textAlign: 'center',
  },
  rateBoxVal: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  rateBoxSellingVal: {
    color: '#16A34A',
    fontSize: 14,
  },
  marginStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  marginInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  marginLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  marginVal: {
    fontWeight: '800',
  },
});
