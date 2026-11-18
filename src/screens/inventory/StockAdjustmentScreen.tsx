import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { DataRepository } from '../../services/db';
import { StockAdjustment, StockAdjustmentType, Product } from '../../types';
import { showAlert, confirmAction } from '../../utils/dialog';

const ADJUSTMENT_TYPES: { key: StockAdjustmentType; labelHi: string; labelEn: string; isDeduction: boolean; color: string; bg: string }[] = [
  { key: 'DAMAGE', labelHi: 'टूट-फूट / डैमेज', labelEn: 'Damage / Broken', isDeduction: true, color: '#DC2626', bg: '#FEF2F2' },
  { key: 'EXPIRY', labelHi: 'एक्सपायरी (Expiry)', labelEn: 'Expired', isDeduction: true, color: '#EA580C', bg: '#FFF7ED' },
  { key: 'AUDIT_SHORT', labelHi: 'गिनती में कमी (Shortage)', labelEn: 'Audit Shortage', isDeduction: true, color: '#D97706', bg: '#FFFBEB' },
  { key: 'THEFT_LOSS', labelHi: 'चोरी / नुकसान', labelEn: 'Loss / Theft', isDeduction: true, color: '#B91C1C', bg: '#FEE2E2' },
  { key: 'AUDIT_SURPLUS', labelHi: 'गिनती में अधिक (Surplus)', labelEn: 'Audit Surplus', isDeduction: false, color: '#16A34A', bg: '#DCFCE7' },
  { key: 'MANUAL_IN', labelHi: 'अन्य आवक (+)', labelEn: 'Manual In (+)', isDeduction: false, color: '#059669', bg: '#D1FAE5' },
  { key: 'MANUAL_OUT', labelHi: 'अन्य जावक (-)', labelEn: 'Manual Out (-)', isDeduction: true, color: '#991B1B', bg: '#FEE2E2' },
];

export const StockAdjustmentScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { business, language } = useApp();

  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAdjustment, setEditingAdjustment] = useState<StockAdjustment | null>(null);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<StockAdjustmentType>('DAMAGE');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const loadData = useCallback(async () => {
    if (!business) return;
    try {
      const [adjList, prodList] = await Promise.all([
        DataRepository.getStockAdjustments(business.id),
        DataRepository.getProducts(business.id),
      ]);
      setAdjustments(adjList);
      setProducts(prodList.filter((p) => p.isActive));
    } catch (err) {
      console.warn('Error loading stock adjustments:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [business]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleOpenAddModal = () => {
    setEditingAdjustment(null);
    setSelectedProductId('');
    setSelectedProduct(null);
    setAdjustmentType('DAMAGE');
    setQuantity('');
    setReason('');
    setDate(new Date().toISOString().split('T')[0]);
    setProductSearch('');
    setModalVisible(true);
  };

  const handleOpenEditModal = (item: StockAdjustment) => {
    setEditingAdjustment(item);
    setSelectedProductId(item.productId);
    const prod = products.find((p) => p.id === item.productId) || null;
    setSelectedProduct(prod);
    setAdjustmentType(item.adjustmentType);
    setQuantity(item.quantityBaseUnits.toString());
    setReason(item.reason || '');
    setDate(item.date || new Date().toISOString().split('T')[0]);
    setProductSearch('');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!business) return;
    if (!selectedProductId && !selectedProduct) {
      showAlert(
        language === 'hi' ? 'उत्पाद चुनें' : 'Select Product',
        language === 'hi' ? 'कृपया समायोजन हेतु उत्पाद चुनें।' : 'Please select a product.',
        undefined,
        'danger'
      );
      return;
    }
    const qtyNum = parseFloat(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      showAlert(
        language === 'hi' ? 'अमान्य मात्रा' : 'Invalid Quantity',
        language === 'hi' ? 'कृपया सही संख्या (मात्रा) दर्ज करें।' : 'Please enter a valid positive quantity.',
        undefined,
        'danger'
      );
      return;
    }

    const prod = selectedProduct || products.find((p) => p.id === selectedProductId);
    const unitName = prod?.primarySellingUnit || prod?.unit || 'Piece';

    setSaving(true);
    try {
      const adjId = editingAdjustment ? editingAdjustment.id : `adj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const adjPayload: StockAdjustment = {
        id: adjId,
        businessId: business.id,
        productId: prod?.id || selectedProductId,
        productName: prod?.productName || editingAdjustment?.productName || 'Unknown Product',
        brandName: prod?.brandName || editingAdjustment?.brandName,
        adjustmentType,
        quantityBaseUnits: qtyNum,
        unit: unitName,
        reason: reason.trim() || undefined,
        date,
        createdAt: editingAdjustment ? editingAdjustment.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = await DataRepository.saveStockAdjustment(adjPayload);
      if (res.success) {
        setModalVisible(false);
        await loadData();
        showAlert(
          language === 'hi' ? 'सफल' : 'Success',
          editingAdjustment
            ? (language === 'hi' ? 'स्टॉक समायोजन सफलतापूर्वक अपडेट हो गया।' : 'Stock adjustment updated successfully.')
            : (language === 'hi' ? 'स्टॉक समायोजन दर्ज हो गया और स्टॉक लेज़र अपडेट हो गया।' : 'Stock adjustment saved and ledger updated.'),
          undefined,
          'success'
        );
      } else {
        showAlert(language === 'hi' ? 'त्रुटि' : 'Error', res.error || 'Failed to save adjustment', undefined, 'danger');
      }
    } catch (err: any) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', err.message, undefined, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item: StockAdjustment) => {
    if (!business) return;
    const typeMeta = ADJUSTMENT_TYPES.find((t) => t.key === item.adjustmentType);

    confirmAction(
      language === 'hi' ? 'समायोजन हटाएं' : 'Delete Adjustment',
      language === 'hi'
        ? `क्या आप निश्चित रूप से ${item.productName} का ${item.quantityBaseUnits} ${item.unit} का ${typeMeta?.labelHi || 'समायोजन'} हटाना चाहते हैं?\n\nइससे स्टॉक लेज़र वापस पूर्ववत (revert) हो जाएगा।`
        : `Are you sure you want to delete this adjustment of ${item.quantityBaseUnits} ${item.unit}? Stock ledger will revert.`,
      async () => {
        try {
          const res = await DataRepository.deleteStockAdjustment(business.id, item.id);
          if (res.success) {
            await loadData();
            showAlert(
              language === 'hi' ? 'सफल' : 'Success',
              language === 'hi' ? 'स्टॉक समायोजन हटा दिया गया है।' : 'Adjustment deleted and stock reverted.',
              undefined,
              'success'
            );
          } else {
            showAlert(language === 'hi' ? 'त्रुटि' : 'Error', res.error || 'Failed to delete adjustment', undefined, 'danger');
          }
        } catch (err: any) {
          showAlert(language === 'hi' ? 'त्रुटि' : 'Error', err.message, undefined, 'danger');
        }
      },
      language === 'hi' ? 'हटाएं' : 'Delete',
      language === 'hi' ? 'रद्द करें' : 'Cancel',
      'danger'
    );
  };

  const filteredAdjustments = useMemo(() => {
    const q = search.toLowerCase();
    return adjustments.filter((a) => {
      const matchSearch =
        a.productName.toLowerCase().includes(q) ||
        (a.brandName && a.brandName.toLowerCase().includes(q)) ||
        (a.reason && a.reason.toLowerCase().includes(q));
      const matchFilter = filterType === 'ALL' || a.adjustmentType === filterType;
      return matchSearch && matchFilter;
    });
  }, [adjustments, search, filterType]);

  const totalDeductions = adjustments
    .filter((a) => a.adjustmentType !== 'AUDIT_SURPLUS' && a.adjustmentType !== 'MANUAL_IN')
    .reduce((sum, a) => sum + (a.quantityBaseUnits || 0), 0);

  const totalSurplus = adjustments
    .filter((a) => a.adjustmentType === 'AUDIT_SURPLUS' || a.adjustmentType === 'MANUAL_IN')
    .reduce((sum, a) => sum + (a.quantityBaseUnits || 0), 0);

  const filteredModalProducts = products.filter((p) => {
    const q = productSearch.toLowerCase();
    return p.productName.toLowerCase().includes(q) || p.brandName.toLowerCase().includes(q);
  });

  return (
    <View style={styles.screen}>
      <Header
        title={language === 'hi' ? 'स्टॉक समायोजन (Adjustment)' : 'Stock Adjustments'}
        subtitle={language === 'hi' ? 'डैमेज, एक्सपायरी व भौतिक ऑडिट' : 'Damage, Expiry & Count Audits'}
        showBack={true}
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity style={styles.addBtn} onPress={handleOpenAddModal} activeOpacity={0.8}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.addBtnText}>{language === 'hi' ? 'नया समायोजन' : 'Add Adjustment'}</Text>
          </TouchableOpacity>
        }
      />

      {/* KPI Summary Cards */}
      <View style={styles.kpiRow}>
        <Card style={[styles.kpiCard, { borderLeftColor: Colors.primary }]}>
          <Text style={styles.kpiLabel}>{language === 'hi' ? 'कुल प्रविष्टियां' : 'Total Entries'}</Text>
          <Text style={styles.kpiValue}>{adjustments.length}</Text>
        </Card>

        <Card style={[styles.kpiCard, { borderLeftColor: '#DC2626' }]}>
          <Text style={styles.kpiLabel}>{language === 'hi' ? 'कुल नुकसान (-)' : 'Total Damage/Loss'}</Text>
          <Text style={[styles.kpiValue, { color: '#DC2626' }]}>-{totalDeductions}</Text>
        </Card>

        <Card style={[styles.kpiCard, { borderLeftColor: '#16A34A' }]}>
          <Text style={styles.kpiLabel}>{language === 'hi' ? 'ऑडिट बढ़त (+)' : 'Total Surplus'}</Text>
          <Text style={[styles.kpiValue, { color: '#16A34A' }]}>+{totalSurplus}</Text>
        </Card>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'ALL' && styles.filterChipActive]}
            onPress={() => setFilterType('ALL')}
          >
            <Text style={[styles.filterChipText, filterType === 'ALL' && styles.filterChipTextActive]}>
              {language === 'hi' ? 'सभी (All)' : 'All'}
            </Text>
          </TouchableOpacity>

          {ADJUSTMENT_TYPES.map((t) => {
            const isSel = filterType === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.filterChip, isSel && styles.filterChipActive]}
                onPress={() => setFilterType(t.key)}
              >
                <Text style={[styles.filterChipText, isSel && styles.filterChipTextActive]}>
                  {language === 'hi' ? t.labelHi : t.labelEn}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Search Input */}
      <View style={styles.searchBar}>
        <Input
          placeholder={language === 'hi' ? 'उत्पाद या कारण खोजें...' : 'Search product or reason...'}
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

      {/* Adjustment List */}
      <FlatList
        data={filteredAdjustments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="shield-checkmark-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {language === 'hi' ? 'कोई स्टॉक समायोजन नहीं' : 'No Stock Adjustments Found'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {language === 'hi'
                  ? 'टूट-फूट, एक्सपायरी या ऑडिट अंतर दर्ज करने हेतु ऊपर "+ नया समायोजन" दबाएं।'
                  : 'Tap "+ Add Adjustment" above to record broken, expired, or audited stock differences.'}
              </Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => {
          const meta = ADJUSTMENT_TYPES.find((t) => t.key === item.adjustmentType) || ADJUSTMENT_TYPES[0];
          const isDeduction = meta.isDeduction;

          return (
            <Card style={styles.itemCard}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>{item.productName}</Text>
                  {item.brandName ? <Text style={styles.brandName}>{item.brandName}</Text> : null}
                  <Text style={styles.dateText}>📅 {item.date}</Text>
                </View>

                {/* Adjustment Tag */}
                <View style={[styles.typeBadge, { backgroundColor: meta.bg, borderColor: meta.color }]}>
                  <Text style={[styles.typeBadgeText, { color: meta.color }]}>
                    {isDeduction ? '-' : '+'} {item.quantityBaseUnits} {item.unit} ({language === 'hi' ? meta.labelHi : meta.labelEn})
                  </Text>
                </View>
              </View>

              {item.reason ? (
                <View style={styles.reasonBox}>
                  <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.reasonText}>{item.reason}</Text>
                </View>
              ) : null}

              {/* Action Buttons Row */}
              <View style={styles.cardActionsRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.directionText, { color: isDeduction ? '#DC2626' : '#16A34A' }]}>
                    {isDeduction
                      ? language === 'hi' ? '🔻 स्टॉक से घटाया गया' : '🔻 Subtracted from stock'
                      : language === 'hi' ? '🔺 स्टॉक में जोड़ा गया' : '🔺 Added to stock'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleOpenEditModal(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="create-outline" size={16} color={Colors.primary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.deleteBtn]}
                  onPress={() => handleDelete(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </Card>
          );
        }}
      />

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingAdjustment
                  ? (language === 'hi' ? 'स्टॉक समायोजन सुधारें (Edit)' : 'Edit Stock Adjustment')
                  : (language === 'hi' ? 'नया स्टॉक समायोजन (New Adjustment)' : 'New Stock Adjustment')}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
              {/* Product Picker */}
              <Text style={styles.fieldLabel}>
                {language === 'hi' ? '1. उत्पाद चुनें (Select Product) *' : '1. Product *'}
              </Text>
              {!selectedProduct ? (
                <View style={{ marginBottom: 12 }}>
                  <Input
                    placeholder={language === 'hi' ? 'उत्पाद खोजें...' : 'Search product...'}
                    value={productSearch}
                    onChangeText={setProductSearch}
                  />
                  <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
                    {filteredModalProducts.length === 0 ? (
                      <View style={{ padding: 16, alignItems: 'center' }}>
                        <Text style={{ fontSize: 13, color: Colors.textSecondary, textAlign: 'center' }}>
                          {products.length === 0
                            ? (language === 'hi'
                                ? 'आपके रेट मास्टर में अभी कोई उत्पाद नहीं है। कृपया पहले रेट मास्टर (Rate Master) में उत्पाद जोड़ें।'
                                : 'No products found in your catalog. Please add products in Rate Master first.')
                            : (language === 'hi' ? 'कोई उत्पाद नहीं मिला' : 'No matching product found')}
                        </Text>
                      </View>
                    ) : (
                      filteredModalProducts.map((p) => (
                        <TouchableOpacity
                          key={p.id}
                          style={styles.prodSelectItem}
                          onPress={() => {
                            setSelectedProduct(p);
                            setSelectedProductId(p.id);
                          }}
                        >
                          <Text style={styles.prodSelectName}>{p.productName}</Text>
                          <Text style={styles.prodSelectSpec}>
                            {p.brandName} • {p.packSize}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                </View>
              ) : (
                <View style={styles.selectedProdCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedProdName}>{selectedProduct.productName}</Text>
                    <Text style={styles.selectedProdSpec}>
                      {selectedProduct.brandName} • {selectedProduct.packSize} ({selectedProduct.primarySellingUnit || selectedProduct.unit || 'Piece'})
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedProduct(null);
                      setSelectedProductId('');
                    }}
                  >
                    <Text style={styles.changeProdText}>{language === 'hi' ? 'बदलें' : 'Change'}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Adjustment Reason/Type Selector */}
              <Text style={styles.fieldLabel}>
                {language === 'hi' ? '2. समायोजन का प्रकार (Reason Type) *' : '2. Adjustment Type *'}
              </Text>
              <View style={styles.typeGrid}>
                {ADJUSTMENT_TYPES.map((t) => {
                  const isSel = adjustmentType === t.key;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      style={[
                        styles.typeChip,
                        { borderColor: isSel ? t.color : '#E2E8F0', backgroundColor: isSel ? t.bg : '#F8FAFC' },
                      ]}
                      onPress={() => setAdjustmentType(t.key)}
                    >
                      <Text style={[styles.typeChipText, { color: isSel ? t.color : Colors.textPrimary, fontWeight: isSel ? '700' : '500' }]}>
                        {t.isDeduction ? '🔻' : '🔺'} {language === 'hi' ? t.labelHi : t.labelEn}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Quantity and Date */}
              <View style={styles.twoColRow}>
                <View style={{ flex: 1 }}>
                  <Input
                    label={
                      language === 'hi'
                        ? `मात्रा (${selectedProduct?.primarySellingUnit || selectedProduct?.unit || 'नग/बोतल'}) *`
                        : 'Quantity *'
                    }
                    placeholder="उदा. 2"
                    keyboardType="numeric"
                    value={quantity}
                    onChangeText={setQuantity}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label={language === 'hi' ? 'तारीख (YYYY-MM-DD)' : 'Date'}
                    value={date}
                    onChangeText={setDate}
                  />
                </View>
              </View>

              {/* Notes / Reason Details */}
              <Input
                label={language === 'hi' ? 'विवरण या टिप्पणी (Notes / Remarks)' : 'Remarks / Reason'}
                placeholder={language === 'hi' ? 'उदा. गोदाम में शीशी टूटी, ऑडिट मिलान' : 'e.g. Broken in transit, audit difference'}
                value={reason}
                onChangeText={setReason}
              />
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalActions}>
              <Button
                title={language === 'hi' ? 'रद्द करें' : 'Cancel'}
                variant="outline"
                onPress={() => setModalVisible(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title={
                  editingAdjustment
                    ? (language === 'hi' ? 'परिवर्तन सुरक्षित करें' : 'Update Adjustment')
                    : (language === 'hi' ? 'समायोजन दर्ज करें' : 'Save Adjustment')
                }
                variant="primary"
                loading={saving}
                onPress={handleSave}
                style={{ flex: 1, marginLeft: 8 }}
              />
            </View>
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  addBtnText: {
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
    borderRadius: BorderRadius.md,
    borderLeftWidth: 4,
    backgroundColor: '#FFFFFF',
  },
  kpiLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  filterBar: {
    paddingVertical: 6,
  },
  filterScroll: {
    paddingHorizontal: Spacing.md,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  searchBar: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  listContent: {
    padding: Spacing.md,
    paddingBottom: 80,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
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
    lineHeight: 18,
  },
  itemCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  brandName: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  dateText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 3,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  reasonBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    padding: 6,
    borderRadius: BorderRadius.sm,
    marginTop: 8,
  },
  reasonText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  directionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  deleteBtn: {
    backgroundColor: '#FEF2F2',
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
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 10,
    marginBottom: 6,
  },
  prodSelectItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  prodSelectName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  prodSelectSpec: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  selectedProdCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: 10,
    marginBottom: 10,
  },
  selectedProdName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#166534',
  },
  selectedProdSpec: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  changeProdText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    marginLeft: 8,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  typeChipText: {
    fontSize: 12,
  },
  twoColRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
});
