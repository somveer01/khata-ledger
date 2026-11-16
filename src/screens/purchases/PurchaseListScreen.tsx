import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { DataRepository } from '../../services/db';
import { PurchaseInvoice } from '../../types';
import { formatCurrency } from '../../utils/money';

export const PurchaseListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { business, language } = useApp();

  const filterSupplierId: string | undefined = route.params?.supplierId;
  const filterSupplierName: string | undefined = route.params?.supplierName;

  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Bill Detail Modal
  const [selectedBill, setSelectedBill] = useState<PurchaseInvoice | null>(null);

  const loadData = useCallback(async () => {
    if (!business) return;
    try {
      const list = await DataRepository.getPurchases(business.id);
      if (filterSupplierId) {
        setPurchases(list.filter((p) => p.supplierId === filterSupplierId));
      } else {
        setPurchases(list);
      }
    } catch (err) {
      console.warn('Error loading purchases:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [business, filterSupplierId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const filteredPurchases = purchases.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.supplierName.toLowerCase().includes(q) ||
      (p.invoiceNo && p.invoiceNo.toLowerCase().includes(q))
    );
  });

  const totalPurchasesPaise = purchases.reduce((sum, p) => sum + (p.totalAmountPaise || 0), 0);
  const totalPaidPaise = purchases.reduce((sum, p) => sum + (p.paidAmountPaise || 0), 0);
  const totalDuePaise = purchases.reduce((sum, p) => sum + (p.dueAmountPaise || 0), 0);

  return (
    <View style={styles.screen}>
      <Header
        title={
          filterSupplierName
            ? `${filterSupplierName} के बिल`
            : language === 'hi'
            ? 'खरीद बिल रजिस्टर (Inward)'
            : 'Purchase Invoices'
        }
        subtitle={language === 'hi' ? 'सप्लायर बिल व माल आवक' : 'Supplier Invoices & Purchases'}
        showBack={true}
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() =>
              navigation.navigate('PurchaseEntry', {
                supplierId: filterSupplierId,
                supplierName: filterSupplierName,
              })
            }
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>{language === 'hi' ? 'नया बिल' : 'New Bill'}</Text>
          </TouchableOpacity>
        }
      />

      {/* KPI Cards */}
      <View style={styles.kpiRow}>
        <Card style={[styles.kpiCard, { borderLeftColor: Colors.primary }]}>
          <Text style={styles.kpiLabel}>{language === 'hi' ? 'कुल खरीद राशि' : 'Total Purchased'}</Text>
          <Text style={styles.kpiValue}>{formatCurrency(totalPurchasesPaise)}</Text>
        </Card>

        <Card style={[styles.kpiCard, { borderLeftColor: '#DC2626' }]}>
          <Text style={styles.kpiLabel}>{language === 'hi' ? 'बाकी उधारी' : 'Total Due'}</Text>
          <Text style={[styles.kpiValue, { color: '#DC2626' }]}>{formatCurrency(totalDuePaise)}</Text>
        </Card>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Input
          placeholder={language === 'hi' ? 'सप्लायर या बिल नंबर खोजें...' : 'Search supplier or invoice...'}
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

      {/* Invoices List */}
      <FlatList
        data={filteredPurchases}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="receipt-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {language === 'hi' ? 'कोई खरीद बिल नहीं मिला' : 'No Purchase Invoices Found'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {language === 'hi'
                  ? 'ऊपर "+ नया बिल" बटन दबाकर डीलर का बिल दर्ज करें।'
                  : 'Tap "+ New Bill" above to record dealer purchases.'}
              </Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => {
          const isFullPaid = item.paymentStatus === 'PAID';
          const isPartial = item.paymentStatus === 'PARTIAL';
          const totalUnits = (item.items || []).reduce((sum, it) => sum + (it.totalBaseUnits || it.purchaseQty || 0), 0);

          return (
            <TouchableOpacity onPress={() => setSelectedBill(item)} activeOpacity={0.85}>
              <Card style={styles.billCard}>
                <View style={styles.billHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.billSupplierName}>{item.supplierName}</Text>
                    <Text style={styles.billDate}>
                      📅 {item.invoiceDate} {item.invoiceNo ? `• बिल #${item.invoiceNo}` : ''}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      isFullPaid
                        ? styles.statusPaid
                        : isPartial
                        ? styles.statusPartial
                        : styles.statusUnpaid,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        isFullPaid
                          ? styles.statusTextPaid
                          : isPartial
                          ? styles.statusTextPartial
                          : styles.statusTextUnpaid,
                      ]}
                    >
                      {isFullPaid
                        ? language === 'hi' ? 'पूरा नकद' : 'Paid'
                        : isPartial
                        ? language === 'hi' ? 'आंशिक' : 'Partial'
                        : language === 'hi' ? 'उधार' : 'Credit Due'}
                    </Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.billDetailsRow}>
                  <Text style={styles.itemCountText}>
                    📦 {item.items?.length || 0} आइटम ({totalUnits} कुल यूनिट्स)
                  </Text>
                  <Text style={styles.billTotalText}>{formatCurrency(item.totalAmountPaise)}</Text>
                </View>

                {item.dueAmountPaise > 0 && (
                  <View style={styles.dueAlertRow}>
                    <Text style={styles.dueAlertLabel}>
                      {language === 'hi' ? 'सप्लायर का बाकी:' : 'Due to Pay:'}
                    </Text>
                    <Text style={styles.dueAlertVal}>{formatCurrency(item.dueAmountPaise)}</Text>
                  </View>
                )}
              </Card>
            </TouchableOpacity>
          );
        }}
      />

      {/* Bill Detail Modal */}
      <Modal visible={!!selectedBill} transparent animationType="slide" onRequestClose={() => setSelectedBill(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedBill && (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>{selectedBill.supplierName}</Text>
                    <Text style={styles.modalSub}>
                      📅 {selectedBill.invoiceDate} {selectedBill.invoiceNo ? `• बिल #${selectedBill.invoiceNo}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedBill(null)}>
                    <Ionicons name="close" size={24} color={Colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                  <Text style={styles.modalSectionTitle}>
                    {language === 'hi' ? 'आइटम सूची (Purchased Items):' : 'Items:'}
                  </Text>

                  {selectedBill.items?.map((it, idx) => (
                    <View key={`it_${idx}`} style={styles.modalItemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalItemName}>{it.productName}</Text>
                        <Text style={styles.modalItemSpec}>
                          {it.purchaseQty} {it.purchaseUnit}{' '}
                          {it.unitsPerPack > 1 ? `(× ${it.unitsPerPack} = ${it.totalBaseUnits} ${it.baseUnit})` : ''}
                          {' • '}
                          {formatCurrency(it.withGstRatePaise)}/{it.baseUnit}
                        </Text>
                      </View>
                      <Text style={styles.modalItemTotal}>{formatCurrency(it.totalPaise)}</Text>
                    </View>
                  ))}

                  <View style={styles.modalDivider} />

                  <View style={styles.modalSummaryLine}>
                    <Text style={styles.modalSumLabel}>{language === 'hi' ? 'कुल बिल राशि:' : 'Grand Total:'}</Text>
                    <Text style={styles.modalSumVal}>{formatCurrency(selectedBill.totalAmountPaise)}</Text>
                  </View>
                  <View style={styles.modalSummaryLine}>
                    <Text style={styles.modalSumLabel}>{language === 'hi' ? 'चुकाया गया भुगतान:' : 'Paid:'}</Text>
                    <Text style={[styles.modalSumVal, { color: '#166534' }]}>
                      {formatCurrency(selectedBill.paidAmountPaise)}
                    </Text>
                  </View>
                  <View style={styles.modalSummaryLine}>
                    <Text style={styles.modalSumLabel}>{language === 'hi' ? 'बाकी उधार:' : 'Due:'}</Text>
                    <Text style={[styles.modalSumVal, { color: '#DC2626', fontWeight: '800' }]}>
                      {formatCurrency(selectedBill.dueAmountPaise)}
                    </Text>
                  </View>

                  {/* Attached Bill Photo or Document */}
                  {selectedBill.billPhotoUri && (
                    <View style={styles.modalAttachmentBox}>
                      <Text style={styles.modalSectionTitle}>
                        📎 {language === 'hi' ? 'संलग्न बिल (Attached Bill):' : 'Attached Bill:'}
                      </Text>
                      {selectedBill.billFileType === 'pdf' ? (
                        <TouchableOpacity
                          style={styles.modalPdfBtn}
                          onPress={() => {
                            if (Platform.OS === 'web' && typeof window !== 'undefined' && selectedBill.billPhotoUri) {
                              window.open(selectedBill.billPhotoUri, '_blank');
                            }
                          }}
                        >
                          <Ionicons name="document-text" size={24} color="#DC2626" />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.modalPdfName} numberOfLines={1}>
                              {selectedBill.billFileName || 'Bill_Document.pdf'}
                            </Text>
                            <Text style={styles.modalPdfActionText}>
                              {language === 'hi' ? 'दस्तावेज़ खोलने के लिए टैप करें' : 'Tap to open document'}
                            </Text>
                          </View>
                          <Ionicons name="open-outline" size={18} color={Colors.primary} />
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.modalImageContainer}>
                          <Image
                            source={{ uri: selectedBill.billPhotoUri }}
                            style={styles.modalBillImage}
                            resizeMode="contain"
                          />
                          <TouchableOpacity
                            style={styles.modalOpenImageBtn}
                            onPress={() => {
                              if (Platform.OS === 'web' && typeof window !== 'undefined' && selectedBill.billPhotoUri) {
                                window.open(selectedBill.billPhotoUri, '_blank');
                              }
                            }}
                          >
                            <Ionicons name="expand-outline" size={16} color={Colors.primary} />
                            <Text style={styles.modalOpenImageText}>
                              {language === 'hi' ? 'फुल स्क्रीन में देखें' : 'View Full Image'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </ScrollView>
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
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
    borderLeftWidth: 4,
  },
  kpiLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  searchBar: {
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.xs,
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
  billCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  billHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  billSupplierName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  billDate: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  statusPaid: {
    backgroundColor: '#DCFCE7',
  },
  statusPartial: {
    backgroundColor: '#FEF3C7',
  },
  statusUnpaid: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusTextPaid: {
    color: '#166534',
  },
  statusTextPartial: {
    color: '#B45309',
  },
  statusTextUnpaid: {
    color: '#DC2626',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: Spacing.sm,
  },
  billDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemCountText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  billTotalText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  dueAlertRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    marginTop: 6,
  },
  dueAlertLabel: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '600',
  },
  dueAlertVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
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
  modalSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginVertical: 6,
  },
  modalItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  modalItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalItemSpec: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  modalItemTotal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: Spacing.sm,
  },
  modalSummaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modalSumLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  modalSumVal: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalAttachmentBox: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  modalPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: Spacing.sm,
  },
  modalPdfName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalPdfActionText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  modalImageContainer: {
    alignItems: 'center',
    marginTop: 4,
  },
  modalBillImage: {
    width: '100%',
    height: 180,
    borderRadius: BorderRadius.md,
    backgroundColor: '#F1F5F9',
  },
  modalOpenImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#EEF2FF',
    borderRadius: BorderRadius.sm,
  },
  modalOpenImageText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
});
