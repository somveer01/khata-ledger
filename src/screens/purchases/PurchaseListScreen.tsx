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
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { DataRepository } from '../../services/db';
import { PurchaseInvoice } from '../../types';
import { formatCurrency } from '../../utils/money';
import { showAlert, confirmAction } from '../../utils/dialog';

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
  // Full-Screen Bill Preview Modal
  const [previewBill, setPreviewBill] = useState<{ uri: string; fileType: 'image' | 'pdf'; fileName: string } | null>(null);

  const openInNewWindowSafe = (dataUri: string, isPdf: boolean, fileName?: string) => {
    if (typeof window === 'undefined') return;
    try {
      if (dataUri.startsWith('data:')) {
        const arr = dataUri.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || (isPdf ? 'application/pdf' : 'image/jpeg');
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        return;
      }
      window.open(dataUri, '_blank');
    } catch (e) {
      const win = window.open('', '_blank');
      if (win) {
        if (isPdf) {
          win.document.write(`<title>${fileName || 'Dealer Bill PDF'}</title><iframe src="${dataUri}" frameborder="0" style="border:0; width:100vw; height:100vh;" allowfullscreen></iframe>`);
        } else {
          win.document.write(`<title>${fileName || 'Dealer Bill'}</title><body style="margin:0; background:#0F172A; display:flex; align-items:center; justify-content:center; min-height:100vh;"><img src="${dataUri}" style="max-width:100%; max-height:100vh; object-fit:contain;" /></body>`);
        }
      }
    }
  };

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

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleEditBill = (bill: PurchaseInvoice) => {
    setSelectedBill(null);
    navigation.navigate('PurchaseEntry', { editInvoice: bill });
  };

  const handleDeleteBill = (bill: PurchaseInvoice) => {
    if (!business) return;
    confirmAction(
      language === 'hi' ? 'खरीद बिल हटाएं' : 'Delete Purchase Invoice',
      language === 'hi'
        ? `क्या आप निश्चित रूप से ${bill.supplierName} का बिल #${bill.invoiceNo || bill.id} हटाना चाहते हैं?\n\nयह खरीद आपके स्टॉक लेज़र से और सप्लायर के बहीखाते से घट जाएगी।`
        : `Are you sure you want to delete invoice #${bill.invoiceNo || bill.id} from ${bill.supplierName}? This will revert stock and supplier balances.`,
      async () => {
        try {
          const res = await DataRepository.deletePurchase(business.id, bill.id);
          if (res.success) {
            setSelectedBill(null);
            await loadData();
            showAlert(
              language === 'hi' ? 'सफल' : 'Success',
              language === 'hi' ? 'खरीद बिल हटा दिया गया है और स्टॉक अपडेट हो गया है।' : 'Purchase invoice deleted successfully.',
              undefined,
              'success'
            );
          } else {
            showAlert(language === 'hi' ? 'त्रुटि' : 'Error', res.error || 'Failed to delete invoice', undefined, 'danger');
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                      <Text style={styles.billDate}>
                        📅 {item.invoiceDate} {item.invoiceNo ? `• बिल #${item.invoiceNo}` : ''}
                      </Text>
                      <View
                        style={[
                          styles.taxTypeBadge,
                          (item.isGstInvoice !== false && (item.gstAmountPaise ?? 0) > 0)
                            ? styles.taxTypeGst
                            : styles.taxTypeNonGst,
                        ]}
                      >
                        <Ionicons
                          name={
                            (item.isGstInvoice !== false && (item.gstAmountPaise ?? 0) > 0)
                              ? 'shield-checkmark'
                              : 'document-text'
                          }
                          size={10}
                          color={
                            (item.isGstInvoice !== false && (item.gstAmountPaise ?? 0) > 0)
                              ? '#4F46E5'
                              : '#D97706'
                          }
                        />
                        <Text
                          style={[
                            styles.taxTypeBadgeText,
                            {
                              color:
                                (item.isGstInvoice !== false && (item.gstAmountPaise ?? 0) > 0)
                                  ? '#4F46E5'
                                  : '#B45309',
                            },
                          ]}
                        >
                          {(item.isGstInvoice !== false && (item.gstAmountPaise ?? 0) > 0)
                            ? 'GST बिल'
                            : 'बिना GST (कच्चा)'}
                        </Text>
                      </View>
                    </View>
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

                <View style={styles.cardFooterActionsRow}>
                  <View style={{ flex: 1 }}>
                    {item.dueAmountPaise > 0 ? (
                      <View style={styles.dueAlertRow}>
                        <Text style={styles.dueAlertLabel}>
                          {language === 'hi' ? 'सप्लायर का बाकी:' : 'Due to Pay:'}
                        </Text>
                        <Text style={styles.dueAlertVal}>{formatCurrency(item.dueAmountPaise)}</Text>
                      </View>
                    ) : (
                      <Text style={styles.fullyPaidBadgeText}>
                        ✓ {language === 'hi' ? 'पूर्ण भुगतान' : 'Fully Paid'}
                      </Text>
                    )}
                  </View>

                  <View style={styles.actionButtonsRow}>
                    {item.billPhotoUri ? (
                      <TouchableOpacity
                        style={styles.cardViewBillBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          setPreviewBill({
                            uri: item.billPhotoUri!,
                            fileType: item.billFileType || 'image',
                            fileName: item.billFileName || `Bill_${item.invoiceNo || item.id}`,
                          });
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="eye-outline" size={14} color="#059669" />
                        <Text style={styles.cardViewBillBtnText}>
                          {language === 'hi' ? 'बिल देखें' : 'View Bill'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleEditBill(item);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="create-outline" size={16} color={Colors.primary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionIconBtn, styles.deleteIconBtn]}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDeleteBill(item);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
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
                          {it.gstPercent > 0 ? ` (GST ${it.gstPercent}%)` : ' (बिना GST)'}
                        </Text>
                      </View>
                      <Text style={styles.modalItemTotal}>{formatCurrency(it.totalPaise)}</Text>
                    </View>
                  ))}

                  <View style={styles.modalDivider} />

                  {(selectedBill.isGstInvoice !== false && (selectedBill.gstAmountPaise ?? 0) > 0) ? (
                    <>
                      <View style={styles.modalSummaryLine}>
                        <Text style={styles.modalSumLabel}>{language === 'hi' ? 'कुल बेस राशि:' : 'Subtotal:'}</Text>
                        <Text style={styles.modalSumVal}>{formatCurrency(selectedBill.subtotalPaise)}</Text>
                      </View>
                      <View style={styles.modalSummaryLine}>
                        <Text style={styles.modalSumLabel}>{language === 'hi' ? 'कुल GST टैक्स:' : 'Total GST:'}</Text>
                        <Text style={styles.modalSumVal}>{formatCurrency(selectedBill.gstAmountPaise)}</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.modalSummaryLine}>
                      <Text style={styles.modalSumLabel}>{language === 'hi' ? 'बिल प्रकार:' : 'Bill Mode:'}</Text>
                      <Text style={[styles.modalSumVal, { color: '#B45309', fontWeight: '700' }]}>
                        📄 {language === 'hi' ? 'बिना GST बिल (0% टैक्स)' : 'Non-GST (0% Tax)'}
                      </Text>
                    </View>
                  )}

                  <View style={styles.modalSummaryLine}>
                    <Text style={styles.modalSumLabel}>{language === 'hi' ? 'कुल बिल राशि:' : 'Grand Total:'}</Text>
                    <Text style={[styles.modalSumVal, { fontWeight: '900' }]}>{formatCurrency(selectedBill.totalAmountPaise)}</Text>
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
                            setPreviewBill({
                              uri: selectedBill.billPhotoUri!,
                              fileType: 'pdf',
                              fileName: selectedBill.billFileName || 'Bill_Document.pdf',
                            });
                          }}
                        >
                          <Ionicons name="document-text" size={24} color="#DC2626" />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.modalPdfName} numberOfLines={1}>
                              {selectedBill.billFileName || 'Bill_Document.pdf'}
                            </Text>
                            <Text style={styles.modalPdfActionText}>
                              {language === 'hi' ? 'दस्तावेज़ देखने के लिए टैप करें' : 'Tap to view bill document'}
                            </Text>
                          </View>
                          <Ionicons name="eye-outline" size={18} color="#059669" />
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.modalImageContainer}>
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => {
                              setPreviewBill({
                                uri: selectedBill.billPhotoUri!,
                                fileType: 'image',
                                fileName: selectedBill.billFileName || 'Bill_Photo.jpg',
                              });
                            }}
                          >
                            <Image
                              source={{ uri: selectedBill.billPhotoUri }}
                              style={styles.modalBillImage}
                              resizeMode="contain"
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.modalOpenImageBtn}
                            onPress={() => {
                              setPreviewBill({
                                uri: selectedBill.billPhotoUri!,
                                fileType: 'image',
                                fileName: selectedBill.billFileName || 'Bill_Photo.jpg',
                              });
                            }}
                          >
                            <Ionicons name="eye-outline" size={16} color="#059669" />
                            <Text style={[styles.modalOpenImageText, { color: '#059669', fontWeight: '700' }]}>
                              {language === 'hi' ? 'बिल देखें (View Bill)' : 'View Bill'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </ScrollView>

                {/* Modal Edit & Delete Actions */}
                <View style={styles.modalActionButtonsRow}>
                  <Button
                    title={language === 'hi' ? 'बिल सुधारें' : 'Edit Bill'}
                    variant="outline"
                    icon={<Ionicons name="create-outline" size={16} color={Colors.primary} />}
                    onPress={() => handleEditBill(selectedBill)}
                    style={{ flex: 1, marginRight: 8 }}
                  />
                  <Button
                    title={language === 'hi' ? 'हटाएं' : 'Delete'}
                    variant="danger"
                    icon={<Ionicons name="trash-outline" size={16} color="#FFFFFF" />}
                    onPress={() => handleDeleteBill(selectedBill)}
                    style={{ flex: 1, marginLeft: 8 }}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Full-Screen Bill Preview Modal */}
      <Modal
        visible={!!previewBill}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewBill(null)}
      >
        <View style={styles.billPreviewOverlay}>
          <View style={styles.billPreviewModal}>
            <View style={styles.billPreviewHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.billPreviewTitle}>
                  {previewBill?.fileType === 'pdf' ? '📄 डीलर बिल (PDF)' : '📷 डीलर बिल (Photo)'}
                </Text>
                <Text style={styles.billPreviewSubtitle} numberOfLines={1}>
                  {previewBill?.fileName || 'dealer_bill'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.billPreviewCloseBtn}
                onPress={() => setPreviewBill(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={28} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.billPreviewBody}>
              {previewBill?.fileType === 'image' && previewBill?.uri ? (
                <ScrollView
                  style={{ flex: 1, width: '100%' }}
                  contentContainerStyle={{ alignItems: 'center', justifyContent: 'center', minHeight: '100%' }}
                  maximumZoomScale={3}
                  minimumZoomScale={1}
                >
                  <Image
                    source={{ uri: previewBill.uri }}
                    style={styles.billPreviewFullImage}
                    resizeMode="contain"
                  />
                </ScrollView>
              ) : previewBill?.fileType === 'pdf' && previewBill?.uri ? (
                <View style={styles.billPreviewPdfBox}>
                  <Ionicons name="document-text" size={68} color="#DC2626" />
                  <Text style={styles.billPreviewPdfName}>
                    {previewBill.fileName || 'Dealer_Bill_Document.pdf'}
                  </Text>
                  <Text style={styles.billPreviewPdfHint}>
                    {language === 'hi'
                      ? 'PDF दस्तावेज़ सुरक्षित रूप से संलग्न है। बड़ी स्क्रीन में देखने या प्रिंट करने हेतु नीचे दिए बटन पर टैप करें।'
                      : 'PDF Document attached safely. Tap below to view or print in full window.'}
                  </Text>
                  <TouchableOpacity
                    style={styles.openExternalBtn}
                    onPress={() => openInNewWindowSafe(previewBill.uri, true, previewBill.fileName)}
                  >
                    <Ionicons name="open-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.openExternalBtnText}>
                      {language === 'hi' ? 'अलग विंडो में PDF खोलें' : 'Open PDF in New Window'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            <View style={styles.billPreviewFooter}>
              {previewBill?.fileType === 'image' && previewBill?.uri && (
                <TouchableOpacity
                  style={styles.billPreviewExternalBtn}
                  onPress={() => openInNewWindowSafe(previewBill.uri, false, previewBill.fileName)}
                >
                  <Ionicons name="expand-outline" size={16} color={Colors.primary} />
                  <Text style={styles.billPreviewExternalBtnText}>
                    {language === 'hi' ? 'अलग विंडो में देखें' : 'Open Full Window'}
                  </Text>
                </TouchableOpacity>
              )}
              <Button
                title={language === 'hi' ? 'बंद करें (Close)' : 'Close'}
                variant="outline"
                onPress={() => setPreviewBill(null)}
                style={{ flex: 1, backgroundColor: '#FFFFFF' }}
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
  taxTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  taxTypeGst: {
    backgroundColor: '#EEF2FF',
  },
  taxTypeNonGst: {
    backgroundColor: '#FEF3C7',
  },
  taxTypeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
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
  cardFooterActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  fullyPaidBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteIconBtn: {
    backgroundColor: '#FEF2F2',
  },
  cardViewBillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
  },
  cardViewBillBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  billPreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.sm,
  },
  billPreviewModal: {
    backgroundColor: '#1E293B',
    borderRadius: BorderRadius.lg,
    width: '100%',
    maxWidth: 600,
    height: '85%',
    maxHeight: 720,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  billPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  billPreviewTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  billPreviewSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  billPreviewCloseBtn: {
    padding: 4,
  },
  billPreviewBody: {
    flex: 1,
    backgroundColor: '#0B1120',
    alignItems: 'center',
    justifyContent: 'center',
  },
  billPreviewFullImage: {
    width: '100%',
    height: 480,
    maxWidth: 580,
  },
  billPreviewPdfBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    maxWidth: 420,
  },
  billPreviewPdfName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  billPreviewPdfHint: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: Spacing.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  openExternalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  openExternalBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  billPreviewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  billPreviewExternalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
  },
  billPreviewExternalBtnText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  modalActionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
});
