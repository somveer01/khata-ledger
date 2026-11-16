import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { DataRepository } from '../../services/db';
import { Product, Supplier, PurchaseInvoice, PurchaseItemDetail, PaymentMethod } from '../../types';
import { formatCurrency, toPaise, toRupees } from '../../utils/money';
import { showAlert } from '../../utils/dialog';

export const PurchaseEntryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { business, language } = useApp();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(route.params?.supplierId || '');
  const [supplierName, setSupplierName] = useState<string>(route.params?.supplierName || '');
  const [invoiceNo, setInvoiceNo] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Items in current bill
  const [items, setItems] = useState<PurchaseItemDetail[]>([]);

  // Item Add Modal
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [buyUnitType, setBuyUnitType] = useState<'CASE' | 'BASE'>('CASE'); // Buying in Box/Case or individual Pieces
  const [inputQty, setInputQty] = useState('');
  const [billingRate, setBillingRate] = useState('');
  const [gstPercent, setGstPercent] = useState<number>(18);
  const [productSearch, setProductSearch] = useState('');

  // Payment Status
  const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'UNPAID' | 'PARTIAL'>('UNPAID');
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [billPhotoUri, setBillPhotoUri] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!business) return;
    DataRepository.getSuppliers(business.id).then((list) => {
      setSuppliers(list);
      if (selectedSupplierId) {
        const found = list.find((s) => s.id === selectedSupplierId);
        if (found) setSupplierName(found.name);
      }
    });
    DataRepository.getProducts(business.id).then((list) => {
      setProducts(list.filter((p) => p.isActive));
    });
  }, [business?.id]);

  // Open item add modal
  const openAddItemModal = () => {
    setSelectedProduct(null);
    setInputQty('1');
    setBillingRate('');
    setBuyUnitType('CASE');
    setProductSearch('');
    setItemModalVisible(true);
  };

  const handleSelectProduct = (prod: Product) => {
    setSelectedProduct(prod);
    setGstPercent(prod.gstPercent ?? 18);
    const rateRupees = toRupees(prod.billingRatePaise || 0);
    setBillingRate(rateRupees > 0 ? rateRupees.toString() : '');
    // If product has unitsPerCase, default to CASE, otherwise BASE
    if ((prod.unitsPerCase && prod.unitsPerCase > 1) || (prod.conversionFactor && prod.conversionFactor > 1)) {
      setBuyUnitType('CASE');
    } else {
      setBuyUnitType('BASE');
    }
  };

  const handleAddItemToBill = () => {
    if (!selectedProduct) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'कृपया उत्पाद चुनें।' : 'Please select product.', undefined, 'danger');
      return;
    }
    const qty = parseFloat(inputQty);
    if (isNaN(qty) || qty <= 0) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'कृपया सही मात्रा दर्ज करें।' : 'Please enter valid quantity.', undefined, 'danger');
      return;
    }
    const rate = parseFloat(billingRate);
    if (isNaN(rate) || rate < 0) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'कृपया सही खरीद दर दर्ज करें।' : 'Please enter valid rate.', undefined, 'danger');
      return;
    }

    const unitsPerPack = selectedProduct.unitsPerCase || selectedProduct.conversionFactor || 1;
    const isCase = buyUnitType === 'CASE';
    const totalBaseUnits = isCase ? qty * unitsPerPack : qty;
    const purchaseUnit = isCase ? selectedProduct.purchasePackagingUnit || 'BOX' : selectedProduct.primarySellingUnit || selectedProduct.unit || 'PC';
    const baseUnit = selectedProduct.primarySellingUnit || selectedProduct.unit || 'PC';

    // Rate calculation: rate is per base unit
    const ratePaise = toPaise(rate);
    const withGstRatePaise = Math.round(ratePaise * (1 + gstPercent / 100));
    const totalPaise = totalBaseUnits * withGstRatePaise;

    const newItem: PurchaseItemDetail = {
      productId: selectedProduct.id,
      productName: selectedProduct.productName,
      brandName: selectedProduct.brandName,
      category: selectedProduct.category,
      packSize: selectedProduct.packSize,
      purchaseQty: qty,
      purchaseUnit,
      unitsPerPack: isCase ? unitsPerPack : 1,
      totalBaseUnits,
      baseUnit,
      billingRatePaise: ratePaise,
      gstPercent,
      withGstRatePaise,
      totalPaise,
    };

    setItems([...items, newItem]);
    setItemModalVisible(false);
  };

  const handleRemoveItem = (index: number) => {
    const next = [...items];
    next.splice(index, 1);
    setItems(next);
  };

  // Bill totals
  const subtotalPaise = items.reduce((sum, item) => sum + item.totalBaseUnits * item.billingRatePaise, 0);
  const totalAmountPaise = items.reduce((sum, item) => sum + item.totalPaise, 0);
  const gstAmountPaise = Math.max(0, totalAmountPaise - subtotalPaise);

  // Auto calculate paid/due based on status
  const totalRupees = toRupees(totalAmountPaise);
  const calculatedPaidAmountPaise =
    paymentStatus === 'PAID'
      ? totalAmountPaise
      : paymentStatus === 'PARTIAL'
      ? toPaise(parseFloat(paidAmount) || 0)
      : 0;
  const calculatedDueAmountPaise = Math.max(0, totalAmountPaise - calculatedPaidAmountPaise);

  const handleSavePurchase = async () => {
    if (!business) return;
    if (!supplierName.trim()) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'कृपया सप्लायर का नाम चुनें या दर्ज करें।' : 'Please specify supplier.', undefined, 'danger');
      return;
    }
    if (items.length === 0) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'कृपया कम से कम एक उत्पाद बिल में जोड़ें।' : 'Please add at least one item.', undefined, 'danger');
      return;
    }

    setSaving(true);
    try {
      // Find or create supplier
      let supId = selectedSupplierId;
      if (!supId) {
        const existing = suppliers.find((s) => s.name.toLowerCase() === supplierName.trim().toLowerCase());
        if (existing) {
          supId = existing.id;
        } else {
          supId = `sup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          await DataRepository.saveSupplier({
            id: supId,
            businessId: business.id,
            name: supplierName.trim(),
            phone: '',
            totalPurchasePaise: 0,
            totalPaidPaise: 0,
            currentOutstandingPaise: 0,
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }

      const purchaseId = `pur_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newPurchase: PurchaseInvoice = {
        id: purchaseId,
        businessId: business.id,
        supplierId: supId,
        supplierName: supplierName.trim(),
        invoiceNo: invoiceNo.trim() || undefined,
        invoiceDate,
        items,
        subtotalPaise,
        gstAmountPaise,
        totalAmountPaise,
        paidAmountPaise: calculatedPaidAmountPaise,
        dueAmountPaise: calculatedDueAmountPaise,
        paymentStatus,
        paymentMethod: paymentStatus !== 'UNPAID' ? paymentMethod : undefined,
        billPhotoUri: billPhotoUri || undefined,
        notes: notes.trim() || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = await DataRepository.savePurchase(newPurchase);
      if (res.success) {
        showAlert(
          language === 'hi' ? 'सफल' : 'Success',
          language === 'hi'
            ? `खरीद बिल सुरक्षित हो गया! कुल ${items.length} उत्पादों का स्टॉक लेज़र में जुड़ गया।`
            : `Purchase bill saved! Stock updated for ${items.length} items.`,
          () => navigation.goBack(),
          'success'
        );
      } else {
        showAlert(language === 'hi' ? 'त्रुटि' : 'Error', res.error || 'Failed to save purchase bill', undefined, 'danger');
      }
    } catch (err: any) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', err.message, undefined, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const q = productSearch.toLowerCase();
    return p.productName.toLowerCase().includes(q) || p.brandName.toLowerCase().includes(q);
  });

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header
        title={language === 'hi' ? 'खरीद प्रविष्टि (Purchase Entry)' : 'New Purchase Bill'}
        subtitle={language === 'hi' ? 'डीलर माल व स्टॉक इनवर्ड' : 'Dealer Inward & Stock Entry'}
        showBack={true}
        onBack={() => navigation.goBack()}
      />

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Section 1: Supplier & Bill Details */}
        <Card style={styles.card}>
          <Text style={styles.sectionHeader}>
            🏢 {language === 'hi' ? 'सप्लायर एवं बिल विवरण' : 'Supplier & Bill Details'}
          </Text>

          {/* Quick Supplier Picker Chips */}
          {suppliers.length > 0 && (
            <View style={{ marginBottom: Spacing.sm }}>
              <Text style={styles.fieldSubLabel}>
                {language === 'hi' ? 'सप्लायर चुनें (Choose Supplier):' : 'Select Supplier:'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                {suppliers.map((s) => {
                  const isSel = selectedSupplierId === s.id || supplierName === s.name;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.supChip, isSel && styles.supChipActive]}
                      onPress={() => {
                        setSelectedSupplierId(s.id);
                        setSupplierName(s.name);
                      }}
                    >
                      <Text style={[styles.supChipText, isSel && styles.supChipTextActive]}>{s.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <Input
            label={language === 'hi' ? 'सप्लायर / डीलर का नाम *' : 'Supplier / Dealer Name *'}
            placeholder="उदा. श्रीराम कृषि केंद्र, बायर एजेंसी"
            value={supplierName}
            onChangeText={(txt) => {
              setSupplierName(txt);
              setSelectedSupplierId('');
            }}
          />

          <View style={styles.twoColRow}>
            <View style={{ flex: 1 }}>
              <Input
                label={language === 'hi' ? 'बिल / चालान नंबर' : 'Invoice / Bill No.'}
                placeholder="उदा. INV-8842"
                value={invoiceNo}
                onChangeText={setInvoiceNo}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label={language === 'hi' ? 'बिल तारीख' : 'Invoice Date'}
                placeholder="YYYY-MM-DD"
                value={invoiceDate}
                onChangeText={setInvoiceDate}
              />
            </View>
          </View>
        </Card>

        {/* Section 2: Items in Bill */}
        <Card style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>
              📦 {language === 'hi' ? 'खरीदा गया माल (Items)' : 'Purchased Items'}
            </Text>
            <TouchableOpacity style={styles.addItemBtn} onPress={openAddItemModal}>
              <Ionicons name="add-circle" size={18} color="#FFFFFF" />
              <Text style={styles.addItemBtnText}>{language === 'hi' ? '+ आइटम जोड़ें' : '+ Add Item'}</Text>
            </TouchableOpacity>
          </View>

          {items.length === 0 ? (
            <View style={styles.noItemsBox}>
              <Ionicons name="cart-outline" size={32} color={Colors.textMuted} />
              <Text style={styles.noItemsText}>
                {language === 'hi'
                  ? 'बिल में अभी कोई माल नहीं जुड़ा है।\nऊपर "+ आइटम जोड़ें" बटन दबाकर उत्पाद जोड़ें।'
                  : 'No items in this bill yet. Tap "+ Add Item" above.'}
              </Text>
            </View>
          ) : (
            items.map((item, idx) => (
              <View key={`item_${idx}`} style={styles.itemRowCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{item.productName}</Text>
                  <Text style={styles.itemBrand}>
                    {item.brandName} • {item.packSize}
                  </Text>
                  <View style={styles.itemFormulaBadge}>
                    <Text style={styles.itemFormulaText}>
                      {item.purchaseQty} {item.purchaseUnit}{' '}
                      {item.unitsPerPack > 1 ? `(× ${item.unitsPerPack} = ${item.totalBaseUnits} ${item.baseUnit})` : ''}
                      {' • '}
                      {formatCurrency(item.withGstRatePaise)}/{item.baseUnit}
                    </Text>
                  </View>
                </View>

                <View style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <TouchableOpacity onPress={() => handleRemoveItem(idx)}>
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </TouchableOpacity>
                  <Text style={styles.itemTotalAmount}>{formatCurrency(item.totalPaise)}</Text>
                </View>
              </View>
            ))
          )}

          {/* Bill Totals Summary */}
          {items.length > 0 && (
            <View style={styles.billSummaryBox}>
              <View style={styles.summaryLine}>
                <Text style={styles.summaryLabel}>{language === 'hi' ? 'कुल बेस राशि:' : 'Subtotal:'}</Text>
                <Text style={styles.summaryVal}>{formatCurrency(subtotalPaise)}</Text>
              </View>
              <View style={styles.summaryLine}>
                <Text style={styles.summaryLabel}>{language === 'hi' ? 'कुल GST टैक्स:' : 'Total GST:'}</Text>
                <Text style={styles.summaryVal}>{formatCurrency(gstAmountPaise)}</Text>
              </View>
              <View style={[styles.summaryLine, styles.grandTotalLine]}>
                <Text style={styles.grandTotalLabel}>{language === 'hi' ? 'कुल बिल राशि:' : 'Grand Total:'}</Text>
                <Text style={styles.grandTotalVal}>{formatCurrency(totalAmountPaise)}</Text>
              </View>
            </View>
          )}
        </Card>

        {/* Section 3: Payment Status & Bill Photo */}
        {items.length > 0 && (
          <Card style={styles.card}>
            <Text style={styles.sectionHeader}>
              💳 {language === 'hi' ? 'भुगतान एवं बिल फोटो' : 'Payment & Bill Attachment'}
            </Text>

            <Text style={styles.fieldSubLabel}>{language === 'hi' ? 'भुगतान की स्थिति' : 'Payment Status'}</Text>
            <View style={styles.paymentStatusRow}>
              {[
                { id: 'UNPAID', label: language === 'hi' ? 'पूरा उधार (Credit)' : 'Unpaid (Credit)' },
                { id: 'PAID', label: language === 'hi' ? 'पूरा नकद (Paid)' : 'Full Paid' },
                { id: 'PARTIAL', label: language === 'hi' ? 'कुछ नकद / कुछ उधार' : 'Partial' },
              ].map((st) => (
                <TouchableOpacity
                  key={st.id}
                  style={[styles.statusChip, paymentStatus === st.id && styles.statusChipActive]}
                  onPress={() => setPaymentStatus(st.id as any)}
                >
                  <Text style={[styles.statusChipText, paymentStatus === st.id && styles.statusChipTextActive]}>
                    {st.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {paymentStatus === 'PARTIAL' && (
              <Input
                label={language === 'hi' ? 'दी गई नकद राशि (₹)' : 'Paid Amount (₹)'}
                placeholder="0.00"
                value={paidAmount}
                onChangeText={setPaidAmount}
                keyboardType="decimal-pad"
                prefix="₹"
              />
            )}

            {paymentStatus !== 'UNPAID' && (
              <View style={{ marginBottom: Spacing.sm }}>
                <Text style={styles.fieldSubLabel}>{language === 'hi' ? 'भुगतान माध्यम' : 'Payment Method'}</Text>
                <View style={styles.methodRow}>
                  {(['UPI', 'CASH', 'BANK_TRANSFER', 'CHEQUE'] as PaymentMethod[]).map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.methodChip, paymentMethod === m && styles.methodChipActive]}
                      onPress={() => setPaymentMethod(m)}
                    >
                      <Text style={[styles.methodChipText, paymentMethod === m && styles.methodChipTextActive]}>
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.dueSummaryBox}>
              <Text style={styles.dueSummaryText}>
                {language === 'hi'
                  ? `सप्लायर खाते में जुड़ेगा: ${formatCurrency(calculatedDueAmountPaise)} (बाकी उधार)`
                  : `Added to Supplier Ledger: ${formatCurrency(calculatedDueAmountPaise)} (Due)`}
              </Text>
            </View>

            {/* Bill Photo Attachment Button */}
            <View style={styles.photoUploadArea}>
              <TouchableOpacity
                style={styles.photoBtn}
                onPress={() => {
                  showAlert(
                    language === 'hi' ? 'बिल फोटो' : 'Bill Photo',
                    language === 'hi'
                      ? 'डीलर के पर्चे या बिल की फोटो जोड़ने की सुविधा तैयार है।'
                      : 'Bill photo attachment active.',
                    undefined,
                    'info'
                  );
                }}
              >
                <Ionicons name="camera" size={20} color={Colors.primary} />
                <Text style={styles.photoBtnText}>
                  {billPhotoUri
                    ? language === 'hi' ? 'बिल फोटो बदलें' : 'Change Bill Photo'
                    : language === 'hi' ? 'डीलर बिल की फोटो खींचें / अपलोड करें' : 'Attach Bill Photo'}
                </Text>
              </TouchableOpacity>
            </View>

            <Input
              label={language === 'hi' ? 'टिप्पणी / नोट्स (Optional)' : 'Notes (Optional)'}
              placeholder="गाड़ी नंबर, ट्रांसपोर्ट या अन्य विवरण..."
              value={notes}
              onChangeText={setNotes}
            />
          </Card>
        )}

        {/* Save Bill Action */}
        <View style={styles.actionContainer}>
          <Button
            title={
              saving
                ? language === 'hi' ? 'सुरक्षित हो रहा है...' : 'Saving...'
                : language === 'hi' ? 'खरीद बिल सुरक्षित करें (Save Bill)' : 'Save Purchase Bill'
            }
            onPress={handleSavePurchase}
            loading={saving}
            disabled={items.length === 0}
          />
        </View>
      </ScrollView>

      {/* Item Selector & Cross-Packing Modal */}
      <Modal visible={itemModalVisible} transparent animationType="slide" onRequestClose={() => setItemModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {language === 'hi' ? 'खरीद माल जोड़ें (Add Item)' : 'Add Purchased Product'}
              </Text>
              <TouchableOpacity onPress={() => setItemModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Product Search & Picker */}
              {!selectedProduct ? (
                <>
                  <Input
                    placeholder={language === 'hi' ? 'उत्पाद का नाम खोजें...' : 'Search product...'}
                    value={productSearch}
                    onChangeText={setProductSearch}
                  />
                  <Text style={styles.fieldSubLabel}>
                    {language === 'hi' ? 'उत्पाद सूची (Select Product):' : 'Available Products:'}
                  </Text>
                  <View style={{ maxHeight: 260 }}>
                    <ScrollView nestedScrollEnabled>
                      {filteredProducts.map((p) => {
                        const unitsPerCase = p.unitsPerCase || p.conversionFactor || 1;
                        return (
                          <TouchableOpacity
                            key={p.id}
                            style={styles.prodSelectItem}
                            onPress={() => handleSelectProduct(p)}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={styles.prodSelectName}>{p.productName}</Text>
                              <Text style={styles.prodSelectSpec}>
                                {p.brandName} • {p.packSize}{' '}
                                {unitsPerCase > 1 ? `[${p.packSize} × ${unitsPerCase} = 1 ${p.purchasePackagingUnit || 'पेटी'}]` : ''}
                              </Text>
                            </View>
                            <Text style={styles.prodSelectPrice}>
                              {formatCurrency(p.withGstRatePaise || p.billingRatePaise)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </>
              ) : (
                <>
                  {/* Selected Product Card */}
                  <View style={styles.selectedProdBanner}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.selectedProdName}>{selectedProduct.productName}</Text>
                      <Text style={styles.selectedProdSub}>
                        {selectedProduct.brandName} • {selectedProduct.packSize}
                      </Text>
                      {/* Cross Packing Formula Card */}
                      <View style={styles.crossFormulaChip}>
                        <Ionicons name="cube" size={14} color="#166534" />
                        <Text style={styles.crossFormulaText}>
                          {selectedProduct.packSize} × {selectedProduct.unitsPerCase || selectedProduct.conversionFactor || 1}{' '}
                          {selectedProduct.primarySellingUnit || selectedProduct.unit || 'बोतल'} = 1{' '}
                          {selectedProduct.purchasePackagingUnit || 'पेटी'}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setSelectedProduct(null)} style={styles.changeProdBtn}>
                      <Text style={styles.changeProdText}>{language === 'hi' ? 'बदलें' : 'Change'}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Buy in Case vs Loose Bottles toggle */}
                  {(selectedProduct.unitsPerCase || selectedProduct.conversionFactor || 1) > 1 && (
                    <View style={{ marginVertical: Spacing.xs }}>
                      <Text style={styles.fieldSubLabel}>{language === 'hi' ? 'खरीदने की इकाई:' : 'Buying Unit:'}</Text>
                      <View style={styles.buyUnitRow}>
                        <TouchableOpacity
                          style={[styles.buyUnitChip, buyUnitType === 'CASE' && styles.buyUnitChipActive]}
                          onPress={() => setBuyUnitType('CASE')}
                        >
                          <Ionicons name="cube-outline" size={16} color={buyUnitType === 'CASE' ? '#FFFFFF' : Colors.textPrimary} />
                          <Text style={[styles.buyUnitText, buyUnitType === 'CASE' && styles.buyUnitTextActive]}>
                            {language === 'hi' ? 'पेटी (Box / Case)' : 'Box / Case'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.buyUnitChip, buyUnitType === 'BASE' && styles.buyUnitChipActive]}
                          onPress={() => setBuyUnitType('BASE')}
                        >
                          <Ionicons name="flask-outline" size={16} color={buyUnitType === 'BASE' ? '#FFFFFF' : Colors.textPrimary} />
                          <Text style={[styles.buyUnitText, buyUnitType === 'BASE' && styles.buyUnitTextActive]}>
                            {language === 'hi' ? 'खुली बोतल / नग' : 'Loose Pieces'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  <View style={styles.twoColRow}>
                    <View style={{ flex: 1 }}>
                      <Input
                        label={
                          buyUnitType === 'CASE'
                            ? language === 'hi' ? 'कुल पेटी (Boxes) *' : 'Total Boxes *'
                            : language === 'hi' ? 'कुल बोतलें / नग *' : 'Total Units *'
                        }
                        placeholder="1"
                        value={inputQty}
                        onChangeText={setInputQty}
                        keyboardType="decimal-pad"
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Input
                        label={language === 'hi' ? 'खरीद दर - बिना GST (₹) *' : 'Rate / Unit (₹) *'}
                        placeholder="0.00"
                        value={billingRate}
                        onChangeText={setBillingRate}
                        keyboardType="decimal-pad"
                        prefix="₹"
                      />
                    </View>
                  </View>

                  {/* Live Conversion Preview */}
                  {buyUnitType === 'CASE' && parseFloat(inputQty) > 0 && (
                    <View style={styles.liveCalculationBox}>
                      <Ionicons name="calculator-outline" size={16} color="#15803D" />
                      <Text style={styles.liveCalculationText}>
                        {parseFloat(inputQty)} पेटी × {selectedProduct.unitsPerCase || selectedProduct.conversionFactor || 1} ={' '}
                        <Text style={{ fontWeight: '800' }}>
                          {parseFloat(inputQty) * (selectedProduct.unitsPerCase || selectedProduct.conversionFactor || 1)}{' '}
                          {selectedProduct.primarySellingUnit || selectedProduct.unit || 'बोतल'}
                        </Text>{' '}
                        स्टॉक में जुड़ेगी।
                      </Text>
                    </View>
                  )}

                  <View style={styles.modalActions}>
                    <Button
                      title={language === 'hi' ? 'रद्द करें' : 'Cancel'}
                      variant="outline"
                      onPress={() => setItemModalVisible(false)}
                      style={{ flex: 1, marginRight: 8 }}
                    />
                    <Button
                      title={language === 'hi' ? 'बिल में जोड़ें' : 'Add to Bill'}
                      onPress={handleAddItemToBill}
                      style={{ flex: 1 }}
                    />
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: 40,
  },
  card: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  addItemBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  fieldSubLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  chipsScroll: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  supChip: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
  },
  supChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  supChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  supChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  noItemsBox: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  noItemsText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  itemRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  itemBrand: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  itemFormulaBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  itemFormulaText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  itemTotalAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#166534',
  },
  billSummaryBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  summaryVal: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  grandTotalLine: {
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    paddingTop: 6,
    marginTop: 4,
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  grandTotalVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#166534',
  },
  paymentStatusRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  statusChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  statusChipActive: {
    backgroundColor: '#166534',
    borderColor: '#166534',
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  statusChipTextActive: {
    color: '#FFFFFF',
  },
  methodRow: {
    flexDirection: 'row',
    gap: 6,
  },
  methodChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  methodChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  methodChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  methodChipTextActive: {
    color: '#FFFFFF',
  },
  dueSummaryBox: {
    backgroundColor: '#FEF2F2',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: Spacing.sm,
  },
  dueSummaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
    textAlign: 'center',
  },
  photoUploadArea: {
    marginBottom: Spacing.sm,
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    gap: 8,
  },
  photoBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  actionContainer: {
    marginTop: Spacing.xs,
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
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: Spacing.md,
  },
  prodSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
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
  prodSelectPrice: {
    fontSize: 12,
    fontWeight: '800',
    color: '#166534',
  },
  selectedProdBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: Spacing.sm,
  },
  selectedProdName: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  selectedProdSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  changeProdBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  changeProdText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
  },
  crossFormulaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    marginTop: 4,
    gap: 4,
    alignSelf: 'flex-start',
  },
  crossFormulaText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
  },
  buyUnitRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  buyUnitChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  buyUnitChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  buyUnitText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  buyUnitTextActive: {
    color: '#FFFFFF',
  },
  liveCalculationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DCFCE7',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xs,
  },
  liveCalculationText: {
    fontSize: 12,
    color: '#166534',
  },
});
