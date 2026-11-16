import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { DataRepository } from '../../services/db';
import { StockItemSummary, ProductCategory } from '../../types';
import { formatCurrency } from '../../utils/money';

const CATEGORY_FILTERS: { key: string; labelHi: string; labelEn: string }[] = [
  { key: 'ALL', labelHi: 'सभी (All)', labelEn: 'All' },
  { key: 'PESTICIDE', labelHi: 'कीटनाशक', labelEn: 'Pesticide' },
  { key: 'INSECTICIDE', labelHi: 'इन्सेक्टिसाइड', labelEn: 'Insecticide' },
  { key: 'FUNGICIDE', labelHi: 'फफूंदनाशक', labelEn: 'Fungicide' },
  { key: 'HERBICIDE', labelHi: 'खरपतवारनाशक', labelEn: 'Herbicide' },
  { key: 'FERTILIZER', labelHi: 'खाद', labelEn: 'Fertilizer' },
  { key: 'SEED', labelHi: 'बीज', labelEn: 'Seed' },
];

export const StockLedgerScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { business, language } = useApp();

  const [stockList, setStockList] = useState<StockItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Product Movement Drilldown Modal
  const [selectedItem, setSelectedItem] = useState<StockItemSummary | null>(null);

  const loadData = useCallback(async () => {
    if (!business) return;
    try {
      const summaries = await DataRepository.getStockLedgerSummary(business.id);
      setStockList(summaries);
    } catch (err) {
      console.warn('Error loading stock summary:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [business]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const filteredStock = stockList.filter((item) => {
    const q = search.toLowerCase();
    const matchSearch =
      item.productName.toLowerCase().includes(q) ||
      item.brandName.toLowerCase().includes(q);
    const matchCategory = selectedCategory === 'ALL' || item.category === selectedCategory;
    return matchSearch && matchCategory;
  });

  const totalProducts = stockList.length;
  const totalStockValuePaise = stockList.reduce((sum, it) => sum + (it.totalStockValuePaise || 0), 0);
  const lowStockCount = stockList.filter((it) => it.status === 'LOW_STOCK' || it.status === 'OUT_OF_STOCK').length;

  return (
    <View style={styles.screen}>
      <Header
        title={language === 'hi' ? 'स्टॉक लेज़र (इन्वेंट्री)' : 'Stock & Inventory Ledger'}
        subtitle={language === 'hi' ? 'खरीद - बिक्री = शेष स्टॉक' : 'Purchases - Sales = Stock Balance'}
        showBack={true}
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity
            style={styles.addPurchaseBtn}
            onPress={() => navigation.navigate('PurchaseEntry')}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.addPurchaseBtnText}>{language === 'hi' ? 'खरीद एंट्री' : 'Add Stock'}</Text>
          </TouchableOpacity>
        }
      />

      {/* KPI Cards */}
      <View style={styles.kpiRow}>
        <Card style={[styles.kpiCard, { borderLeftColor: Colors.primary }]}>
          <Text style={styles.kpiLabel}>{language === 'hi' ? 'कुल उत्पाद' : 'Total Items'}</Text>
          <Text style={styles.kpiValue}>{totalProducts}</Text>
        </Card>

        <Card style={[styles.kpiCard, { borderLeftColor: '#166534' }]}>
          <Text style={styles.kpiLabel}>{language === 'hi' ? 'कुल स्टॉक मूल्य' : 'Total Stock Value'}</Text>
          <Text style={[styles.kpiValue, { color: '#166534' }]}>{formatCurrency(totalStockValuePaise)}</Text>
        </Card>

        <Card style={[styles.kpiCard, { borderLeftColor: lowStockCount > 0 ? '#DC2626' : '#94A3B8' }]}>
          <Text style={styles.kpiLabel}>{language === 'hi' ? 'कम स्टॉक' : 'Low Stock'}</Text>
          <Text style={[styles.kpiValue, { color: lowStockCount > 0 ? '#DC2626' : Colors.textPrimary }]}>
            {lowStockCount}
          </Text>
        </Card>
      </View>

      {/* Category Filter Chips */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {CATEGORY_FILTERS.map((cat) => {
            const isSel = selectedCategory === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[styles.filterChip, isSel && styles.filterChipActive]}
                onPress={() => setSelectedCategory(cat.key)}
              >
                <Text style={[styles.filterChipText, isSel && styles.filterChipTextActive]}>
                  {language === 'hi' ? cat.labelHi : cat.labelEn}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Search Input */}
      <View style={styles.searchBar}>
        <Input
          placeholder={language === 'hi' ? 'उत्पाद या ब्रांड खोजें...' : 'Search product or brand...'}
          value={search}
          onChangeText={setSearch}
          rightElement={
            search ? (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            ) : undefined
          }
        />
      </View>

      {/* Stock Items List */}
      <FlatList
        data={filteredStock}
        keyExtractor={(item) => item.productId}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="cube-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {language === 'hi' ? 'कोई स्टॉक उत्पाद नहीं मिला' : 'No Stock Items Found'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {language === 'hi'
                  ? 'रेट मास्टर में उत्पाद जोड़ें या खरीद एंट्री करें।'
                  : 'Add products in Rate Master or record purchase entries.'}
              </Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => {
          const isOutOfStock = item.status === 'OUT_OF_STOCK';
          const isLowStock = item.status === 'LOW_STOCK';

          // Format dual stock display: e.g. "75 बोतल (1 पेटी + 35 बोतल)"
          const caseUnitName = item.purchasePackagingUnit || 'पेटी';
          let dualDisplay = `${item.currentStockBaseUnits} ${item.sellingUnit}`;
          if (item.unitsPerCase > 1 && item.currentStockBaseUnits > 0) {
            if (item.currentStockCases > 0 && item.currentStockLooseUnits > 0) {
              dualDisplay = `${item.currentStockBaseUnits} ${item.sellingUnit} (${item.currentStockCases} ${caseUnitName} + ${item.currentStockLooseUnits} ${item.sellingUnit})`;
            } else if (item.currentStockCases > 0 && item.currentStockLooseUnits === 0) {
              dualDisplay = `${item.currentStockBaseUnits} ${item.sellingUnit} (${item.currentStockCases} ${caseUnitName})`;
            }
          }

          return (
            <TouchableOpacity onPress={() => setSelectedItem(item)} activeOpacity={0.85}>
              <Card style={styles.stockCard}>
                <View style={styles.cardHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.productName}>{item.productName}</Text>
                    <Text style={styles.brandAndPack}>
                      {item.brandName} • {item.packSize}
                    </Text>
                  </View>

                  {/* Status Badge */}
                  <View
                    style={[
                      styles.statusBadge,
                      isOutOfStock
                        ? styles.statusOut
                        : isLowStock
                        ? styles.statusLow
                        : styles.statusIn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        isOutOfStock
                          ? styles.statusBadgeTextOut
                          : isLowStock
                          ? styles.statusBadgeTextLow
                          : styles.statusBadgeTextIn,
                      ]}
                    >
                      {isOutOfStock
                        ? language === 'hi' ? 'स्टॉक समाप्त' : 'Out of Stock'
                        : isLowStock
                        ? language === 'hi' ? 'कम स्टॉक' : 'Low Stock'
                        : language === 'hi' ? 'पर्याप्त स्टॉक' : 'In Stock'}
                    </Text>
                  </View>
                </View>

                {/* Cross-Packing Formula Badge */}
                {item.unitsPerCase > 1 && (
                  <View style={styles.formulaPill}>
                    <Ionicons name="cube-outline" size={12} color="#166534" />
                    <Text style={styles.formulaPillText}>
                      {item.packSize} × {item.unitsPerCase} = 1 {caseUnitName}{' '}
                      {item.caseVolumeOrWeight ? `(${item.caseVolumeOrWeight})` : ''}
                    </Text>
                  </View>
                )}

                <View style={styles.divider} />

                {/* Stock Math Row: Inward - Outward = Current */}
                <View style={styles.stockMathRow}>
                  <View style={styles.mathCol}>
                    <Text style={styles.mathLabel}>{language === 'hi' ? 'कुल खरीद (+)' : 'Inward (+)'}</Text>
                    <Text style={styles.mathValIn}>
                      +{item.totalPurchasedBaseUnits} {item.sellingUnit}
                    </Text>
                  </View>

                  <View style={styles.mathCol}>
                    <Text style={styles.mathLabel}>{language === 'hi' ? 'कुल बिक्री (-)' : 'Sold (-)'}</Text>
                    <Text style={styles.mathValOut}>
                      -{item.totalSoldBaseUnits} {item.sellingUnit}
                    </Text>
                  </View>

                  <View style={[styles.mathCol, { flex: 1.4, alignItems: 'flex-end' }]}>
                    <Text style={styles.mathLabel}>{language === 'hi' ? 'उपलब्ध शेष (=)' : 'Current Stock (=)'}</Text>
                    <Text
                      style={[
                        styles.mathValCurrent,
                        isOutOfStock ? { color: '#DC2626' } : isLowStock ? { color: '#B45309' } : { color: '#166534' },
                      ]}
                    >
                      {dualDisplay}
                    </Text>
                  </View>
                </View>

                <View style={styles.stockValueFooter}>
                  <Text style={styles.unitCostHint}>
                    {language === 'hi' ? 'खरीद दर:' : 'Unit Cost:'} {formatCurrency(item.unitCostPaise)}/{item.sellingUnit}
                  </Text>
                  <Text style={styles.totalValueHint}>
                    {language === 'hi' ? 'स्टॉक वैल्यू:' : 'Value:'} {formatCurrency(item.totalStockValuePaise)}
                  </Text>
                </View>
              </Card>
            </TouchableOpacity>
          );
        }}
      />

      {/* Item Drilldown Detail Modal */}
      <Modal visible={!!selectedItem} transparent animationType="slide" onRequestClose={() => setSelectedItem(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedItem && (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>{selectedItem.productName}</Text>
                    <Text style={styles.modalSub}>
                      {selectedItem.brandName} • {selectedItem.packSize} • {selectedItem.category}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedItem(null)}>
                    <Ionicons name="close" size={24} color={Colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalBalanceBox}>
                  <Text style={styles.modalBalanceLabel}>
                    {language === 'hi' ? 'वर्तमान उपलब्ध स्टॉक:' : 'Available Stock Balance:'}
                  </Text>
                  <Text style={styles.modalBalanceVal}>
                    {selectedItem.currentStockBaseUnits} {selectedItem.sellingUnit}
                  </Text>
                  {selectedItem.unitsPerCase > 1 && selectedItem.currentStockCases > 0 && (
                    <Text style={styles.modalBalanceCases}>
                      ({selectedItem.currentStockCases} {selectedItem.purchasePackagingUnit || 'पेटी'}{' '}
                      {selectedItem.currentStockLooseUnits > 0 ? `+ ${selectedItem.currentStockLooseUnits} खुली` : ''})
                    </Text>
                  )}
                </View>

                <View style={styles.modalBreakupRow}>
                  <View style={styles.modalBreakupCol}>
                    <Text style={styles.modalBreakupLabel}>{language === 'hi' ? 'कुल खरीद आवक:' : 'Total Inward:'}</Text>
                    <Text style={[styles.modalBreakupVal, { color: '#166534' }]}>
                      +{selectedItem.totalPurchasedBaseUnits} {selectedItem.sellingUnit}
                    </Text>
                  </View>
                  <View style={styles.modalBreakupCol}>
                    <Text style={styles.modalBreakupLabel}>{language === 'hi' ? 'कुल बिक्री जावक:' : 'Total Sold:'}</Text>
                    <Text style={[styles.modalBreakupVal, { color: '#DC2626' }]}>
                      -{selectedItem.totalSoldBaseUnits} {selectedItem.sellingUnit}
                    </Text>
                  </View>
                </View>

                <View style={styles.modalActionButtons}>
                  <TouchableOpacity
                    style={styles.modalAddStockBtn}
                    onPress={() => {
                      setSelectedItem(null);
                      navigation.navigate('PurchaseEntry');
                    }}
                  >
                    <Ionicons name="cart-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.modalAddStockBtnText}>
                      {language === 'hi' ? 'नया माल खरीदें (Purchase Entry)' : 'Add Purchase Bill'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  addPurchaseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  addPurchaseBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  kpiRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  kpiCard: {
    flex: 1,
    padding: Spacing.sm,
    borderLeftWidth: 4,
  },
  kpiLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  kpiValue: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  filterBar: {
    paddingVertical: Spacing.xs,
  },
  filterScroll: {
    paddingHorizontal: Spacing.md,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  searchBar: {
    paddingHorizontal: Spacing.md,
  },
  listContent: {
    padding: Spacing.md,
    paddingBottom: 40,
  },
  emptyCard: {
    alignItems: 'center',
    padding: Spacing.xl,
    marginTop: Spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  stockCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  productName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  brandAndPack: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  statusIn: {
    backgroundColor: '#DCFCE7',
  },
  statusLow: {
    backgroundColor: '#FEF3C7',
  },
  statusOut: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusBadgeTextIn: {
    color: '#166534',
  },
  statusBadgeTextLow: {
    color: '#B45309',
  },
  statusBadgeTextOut: {
    color: '#DC2626',
  },
  formulaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    marginTop: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  formulaPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#166534',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: Spacing.sm,
  },
  stockMathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mathCol: {
    flex: 1,
  },
  mathLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  mathValIn: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
    marginTop: 1,
  },
  mathValOut: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: 1,
  },
  mathValCurrent: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 1,
    textAlign: 'right',
  },
  stockValueFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  unitCostHint: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  totalValueHint: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    width: '100%',
    maxWidth: 480,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  modalSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  modalBalanceBox: {
    backgroundColor: '#F0FDF4',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  modalBalanceLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  modalBalanceVal: {
    fontSize: 24,
    fontWeight: '900',
    color: '#166534',
    marginTop: 2,
  },
  modalBalanceCases: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
    marginTop: 2,
  },
  modalBreakupRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.sm,
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  modalBreakupCol: {
    alignItems: 'center',
  },
  modalBreakupLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  modalBreakupVal: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  modalActionButtons: {
    marginTop: Spacing.xs,
  },
  modalAddStockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    gap: 6,
  },
  modalAddStockBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
