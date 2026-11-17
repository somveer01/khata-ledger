import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DatePickerField } from '../../components/DatePickerField';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { DataRepository } from '../../services/db';
import { Product, Supplier, PurchaseInvoice, PurchaseItemDetail, PaymentMethod } from '../../types';
import { formatCurrency, toPaise, toRupees } from '../../utils/money';
import { showAlert, confirmAction } from '../../utils/dialog';

export const PurchaseEntryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { business, language } = useApp();

  const editInvoice: PurchaseInvoice | undefined = route.params?.editInvoice;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(
    editInvoice?.supplierId || route.params?.supplierId || ''
  );
  const [supplierName, setSupplierName] = useState<string>(
    editInvoice?.supplierName || route.params?.supplierName || ''
  );
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [invoiceNo, setInvoiceNo] = useState<string>(editInvoice?.invoiceNo || '');
  const [invoiceDate, setInvoiceDate] = useState<string>(
    editInvoice?.invoiceDate || new Date().toISOString().split('T')[0]
  );

  // GST Mode: true = GST Bill (Tax applicable), false = Non-GST (बिना जीएसटी / कच्चा बिल - 0% Tax)
  const [isGstInvoice, setIsGstInvoice] = useState<boolean>(
    editInvoice?.isGstInvoice !== undefined
      ? editInvoice.isGstInvoice
      : editInvoice ? editInvoice.gstAmountPaise > 0 : true
  );

  // Items in current bill
  const [items, setItems] = useState<PurchaseItemDetail[]>(editInvoice?.items || []);

  // Item Add Modal
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [buyUnitType, setBuyUnitType] = useState<'CASE' | 'BASE'>('CASE'); // Buying in Box/Case or individual Pieces
  const [inputQty, setInputQty] = useState('');
  const [billingRate, setBillingRate] = useState('');
  const [gstPercent, setGstPercent] = useState<number>(18);
  const [productSearch, setProductSearch] = useState('');

  // Payment Status
  const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'UNPAID' | 'PARTIAL'>(
    editInvoice?.paymentStatus || 'UNPAID'
  );
  const [paidAmount, setPaidAmount] = useState(
    editInvoice?.paidAmountPaise ? toRupees(editInvoice.paidAmountPaise).toString() : ''
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(editInvoice?.paymentMethod || 'UPI');
  const [billPhotoUri, setBillPhotoUri] = useState<string>(editInvoice?.billPhotoUri || '');
  const [billFileName, setBillFileName] = useState<string>(editInvoice?.billFileName || '');
  const [billFileType, setBillFileType] = useState<'image' | 'pdf'>(editInvoice?.billFileType || 'image');
  const [notes, setNotes] = useState(editInvoice?.notes || '');
  const [saving, setSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [viewBillModalVisible, setViewBillModalVisible] = useState(false);

  // Safe Image Compression Helper (Downscale high-res camera photos to prevent local storage quota & Firestore limits)
  const compressImage = (file: File, maxWidth = 1080, maxHeight = 1080, quality = 0.68): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(language === 'hi' ? 'फ़ाइल लोड नहीं हो सकी' : 'Failed to read file'));
      reader.onload = (e) => {
        const rawDataUrl = e.target?.result as string;
        if (!rawDataUrl) {
          reject(new Error(language === 'hi' ? 'फ़ाइल डेटा रिक्त है' : 'Empty file data'));
          return;
        }

        if (typeof window === 'undefined' || !(window as any).Image) {
          resolve(rawDataUrl);
          return;
        }

        const img = new (window as any).Image();
        img.onerror = () => resolve(rawDataUrl);
        img.onload = () => {
          try {
            let { width, height } = img;
            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(rawDataUrl);
              return;
            }

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            const compressed = canvas.toDataURL('image/jpeg', quality);
            resolve(compressed);
          } catch (canvasErr) {
            console.warn('Canvas compression error, using raw:', canvasErr);
            resolve(rawDataUrl);
          }
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    });
  };

  // Safe window opener that works in modern Chrome without top-frame data URI blocking
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

  // File / Camera Picker
  const handlePickFile = (useCamera: boolean = false) => {
    if (typeof document === 'undefined') {
      showAlert(
        language === 'hi' ? 'सूचना' : 'Notice',
        language === 'hi' ? 'फ़ाइल अपलोड वेब/मोबाइल ब्राउज़र में समर्थित है।' : 'File upload supported in browser mode.'
      );
      return;
    }

    try {
      const input = document.createElement('input');
      input.type = 'file';

      const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

      if (useCamera) {
        input.accept = 'image/*';
        if (isMobile) {
          input.setAttribute('capture', 'environment');
        }
      } else {
        input.accept = 'image/*,application/pdf';
      }

      input.onchange = async (e: any) => {
        const file = e.target?.files?.[0];
        if (!file) return;

        setUploadingFile(true);
        try {
          const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

          if (isPdf) {
            if (file.size > 8 * 1024 * 1024) {
              showAlert(
                language === 'hi' ? 'PDF बहुत बड़ी है' : 'PDF Too Large',
                language === 'hi' ? 'कृपया 8MB से छोटी PDF चुनें।' : 'Please choose a PDF under 8MB.',
                undefined,
                'danger'
              );
              return;
            }

            const reader = new FileReader();
            reader.onload = () => {
              setBillPhotoUri(reader.result as string);
              setBillFileName(file.name || 'dealer_bill.pdf');
              setBillFileType('pdf');
            };
            reader.onerror = () => {
              showAlert(language === 'hi' ? 'त्रुटि' : 'Error', 'PDF पढ़ने में विफल रहा', undefined, 'danger');
            };
            reader.readAsDataURL(file);
          } else {
            // Compress image to ~1080px and ~80-120KB for crystal-clear bill text without crashing storage
            const compressedUri = await compressImage(file, 1080, 1080, 0.68);
            setBillPhotoUri(compressedUri);
            setBillFileName(file.name || 'dealer_bill.jpg');
            setBillFileType('image');
          }
        } catch (err: any) {
          console.error('Error processing bill file:', err);
          showAlert(
            language === 'hi' ? 'फ़ोटो लोड करने में त्रुटि' : 'Error Attaching File',
            err.message || (language === 'hi' ? 'फ़ोटो अटैच करने में समस्या आई' : 'Failed to attach image'),
            undefined,
            'danger'
          );
        } finally {
          setUploadingFile(false);
        }
      };

      input.click();
    } catch (err: any) {
      console.error('File picker trigger error:', err);
      showAlert(
        language === 'hi' ? 'कैमरा / फ़ाइल त्रुटि' : 'Camera Error',
        err.message || (language === 'hi' ? 'कैमरा खोलने में समस्या आई' : 'Failed to launch camera'),
        undefined,
        'danger'
      );
    }
  };

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

  // Switch bill tax mode (GST vs Non-GST) with strict single-mode enforcement
  const handleToggleGstMode = (newMode: boolean) => {
    if (newMode === isGstInvoice) return;

    if (items.length > 0) {
      confirmAction(
        language === 'hi'
          ? (newMode ? 'जीएसटी बिल में बदलें?' : 'बिना जीएसटी बिल में बदलें?')
          : (newMode ? 'Switch to GST Bill?' : 'Switch to Non-GST Bill?'),
        language === 'hi'
          ? (newMode
              ? `इस बिल में ${items.length} आइटम जुड़े हैं। जीएसटी बिल करने पर सभी उत्पादों की दरें रेट मास्टर के GST टैक्स स्लैब के अनुसार री-कैलकुलेट होंगी ताकि कोई मिक्सिंग न हो।\n\nक्या आप बदलना चाहते हैं?`
              : `इस बिल में ${items.length} आइटम जुड़े हैं। बिना जीएसटी बिल करने पर सभी उत्पादों पर 0% टैक्स (केवल बिना GST दर) लागू होगी ताकि कोई मिक्सिंग न हो।\n\nक्या आप बदलना चाहते हैं?`)
          : (newMode
              ? `This invoice has ${items.length} items. Switching to GST invoice will recalculate all items with their GST rates. Continue?`
              : `This invoice has ${items.length} items. Switching to Non-GST invoice will remove GST (0% tax) from all items. Continue?`),
        () => {
          setIsGstInvoice(newMode);
          // Recalculate all items uniformly to prevent mixing
          const updated = items.map((it) => {
            if (newMode) {
              const prod = products.find((p) => p.id === it.productId);
              const gst = prod?.gstPercent ?? 18;
              const withGstRatePaise = Math.round(it.billingRatePaise * (1 + gst / 100));
              return {
                ...it,
                gstPercent: gst,
                withGstRatePaise,
                totalPaise: it.totalBaseUnits * withGstRatePaise,
              };
            } else {
              return {
                ...it,
                gstPercent: 0,
                withGstRatePaise: it.billingRatePaise,
                totalPaise: it.totalBaseUnits * it.billingRatePaise,
              };
            }
          });
          setItems(updated);
        },
        language === 'hi' ? 'हाँ, बदलें' : 'Yes, Switch',
        language === 'hi' ? 'रद्द करें' : 'Cancel'
      );
    } else {
      setIsGstInvoice(newMode);
    }
  };

  // Open item add modal
  const openAddItemModal = () => {
    setSelectedProduct(null);
    setInputQty('1');
    setBillingRate('');
    setBuyUnitType('CASE');
    setProductSearch('');
    if (!isGstInvoice) {
      setGstPercent(0);
    }
    setItemModalVisible(true);
  };

  const handleSelectProduct = (prod: Product) => {
    setSelectedProduct(prod);
    if (isGstInvoice) {
      setGstPercent(prod.gstPercent ?? 18);
    } else {
      setGstPercent(0);
    }
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
    const appliedGstPercent = isGstInvoice ? gstPercent : 0;
    const withGstRatePaise = isGstInvoice ? Math.round(ratePaise * (1 + appliedGstPercent / 100)) : ratePaise;
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
      gstPercent: appliedGstPercent,
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

  // Bill totals: strict distinction between GST and Non-GST bills
  const subtotalPaise = items.reduce((sum, item) => sum + item.totalBaseUnits * item.billingRatePaise, 0);
  const totalAmountPaise = isGstInvoice
    ? items.reduce((sum, item) => sum + item.totalPaise, 0)
    : subtotalPaise;
  const gstAmountPaise = isGstInvoice ? Math.max(0, totalAmountPaise - subtotalPaise) : 0;

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

      const purchaseId = editInvoice ? editInvoice.id : `pur_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const purchasePayload: PurchaseInvoice = {
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
        isGstInvoice,
        billPhotoUri: billPhotoUri || undefined,
        billFileName: billFileName || undefined,
        billFileType: billPhotoUri ? billFileType : undefined,
        notes: notes.trim() || undefined,
        createdAt: editInvoice ? editInvoice.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = await DataRepository.savePurchase(purchasePayload);
      if (res.success) {
        showAlert(
          language === 'hi' ? 'सफल' : 'Success',
          editInvoice
            ? (language === 'hi'
                ? `खरीद बिल #${purchasePayload.invoiceNo || purchasePayload.id} सफलतापूर्वक अपडेट हो गया!`
                : 'Purchase invoice updated successfully!')
            : (language === 'hi'
                ? `खरीद बिल सुरक्षित हो गया! कुल ${items.length} उत्पादों का स्टॉक लेज़र में जुड़ गया।`
                : `Purchase bill saved! Stock updated for ${items.length} items.`),
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

  const filteredSuppliers = suppliers.filter((s) => {
    const q = supplierSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.phone && s.phone.includes(q)) ||
      (s.address && s.address.toLowerCase().includes(q))
    );
  });

  const selectedSupplier = suppliers.find(
    (s) => s.id === selectedSupplierId || (supplierName && s.name.toLowerCase() === supplierName.trim().toLowerCase())
  );

  const filteredProducts = products.filter((p) => {
    const q = productSearch.toLowerCase();
    return p.productName.toLowerCase().includes(q) || p.brandName.toLowerCase().includes(q);
  });

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header
        title={
          editInvoice
            ? (language === 'hi' ? 'खरीद बिल सुधारें (Edit Bill)' : 'Edit Purchase Invoice')
            : (language === 'hi' ? 'खरीद प्रविष्टि (Purchase Entry)' : 'New Purchase Bill')
        }
        subtitle={
          editInvoice
            ? (language === 'hi' ? `बिल #${editInvoice.invoiceNo || editInvoice.id}` : 'Edit Invoice & Update Stock')
            : (language === 'hi' ? 'डीलर माल व स्टॉक इनवर्ड' : 'Dealer Inward & Stock Entry')
        }
        showBack={true}
        onBack={() => navigation.goBack()}
      />

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Section 1: Supplier & Bill Details */}
        <Card style={styles.card}>
          <Text style={styles.sectionHeader}>
            🏢 {language === 'hi' ? 'सप्लायर एवं बिल विवरण' : 'Supplier & Bill Details'}
          </Text>

          {/* GST vs Non-GST Bill Type Toggle */}
          <View style={styles.taxModeContainer}>
            <Text style={styles.fieldSubLabel}>
              {language === 'hi' ? 'बिल का प्रकार (Invoice Tax Mode) *' : 'Invoice Tax Type *'}
            </Text>
            <View style={styles.taxToggleRow}>
              <TouchableOpacity
                style={[styles.taxToggleBtn, isGstInvoice && styles.taxToggleBtnActiveGst]}
                onPress={() => handleToggleGstMode(true)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isGstInvoice ? 'shield-checkmark' : 'shield-outline'}
                  size={18}
                  color={isGstInvoice ? '#FFFFFF' : '#4F46E5'}
                />
                <View style={{ marginLeft: 6 }}>
                  <Text style={[styles.taxToggleTitle, isGstInvoice && styles.taxToggleTitleActive]}>
                    {language === 'hi' ? 'जीएसटी बिल (GST Bill)' : 'GST Invoice'}
                  </Text>
                  <Text style={[styles.taxToggleSub, isGstInvoice && styles.taxToggleSubActive]}>
                    {language === 'hi' ? 'GST टैक्स सहित दरें' : 'With GST Slabs'}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.taxToggleBtn, !isGstInvoice && styles.taxToggleBtnActiveNonGst]}
                onPress={() => handleToggleGstMode(false)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={!isGstInvoice ? 'document-text' : 'document-outline'}
                  size={18}
                  color={!isGstInvoice ? '#FFFFFF' : '#D97706'}
                />
                <View style={{ marginLeft: 6 }}>
                  <Text style={[styles.taxToggleTitle, !isGstInvoice && styles.taxToggleTitleActive]}>
                    {language === 'hi' ? 'बिना जीएसटी (Non-GST)' : 'Non-GST Bill'}
                  </Text>
                  <Text style={[styles.taxToggleSub, !isGstInvoice && styles.taxToggleSubActive]}>
                    {language === 'hi' ? 'कच्चा बिल • 0% टैक्स' : '0% Tax • Base Rate'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={[styles.taxNoticeBox, isGstInvoice ? styles.taxNoticeBoxGst : styles.taxNoticeBoxNonGst]}>
              <Ionicons
                name={isGstInvoice ? 'shield-checkmark' : 'alert-circle'}
                size={14}
                color={isGstInvoice ? '#4F46E5' : '#D97706'}
              />
              <Text style={[styles.taxNoticeText, { color: isGstInvoice ? '#3730A3' : '#92400E' }]}>
                {isGstInvoice
                  ? (language === 'hi'
                      ? 'जीएसटी बिल: उत्पाद रेट मास्टर से GST स्लैब व टैक्स दर जुड़ेगी। बिल में कोई बिना-GST आइटम मिक्स नहीं होगा।'
                      : 'GST Bill: Products will load with GST slabs and tax. No mixing with Non-GST items.')
                  : (language === 'hi'
                      ? 'बिना जीएसटी बिल: सभी उत्पादों पर केवल बिना GST दर (0% टैक्स) लागू होगी। बिल में कोई GST आइटम मिक्स नहीं होगा।'
                      : 'Non-GST Bill: Products will load with flat base rate (0% tax). No mixing with GST items.')}
              </Text>
            </View>
          </View>

          {/* Searchable Supplier Dropdown */}
          <View style={{ marginBottom: Spacing.sm }}>
            <Text style={styles.fieldSubLabel}>
              {language === 'hi' ? 'सप्लायर / डीलर चुनें (Select Supplier) *' : 'Select Supplier *'}
            </Text>

            {/* Dropdown Trigger Box */}
            <TouchableOpacity
              style={[
                styles.supplierDropdownTrigger,
                supplierDropdownOpen && styles.supplierDropdownTriggerOpen,
                selectedSupplier ? styles.supplierDropdownTriggerSelected : undefined,
              ]}
              onPress={() => {
                setSupplierSearch('');
                setSupplierDropdownOpen(!supplierDropdownOpen);
              }}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Ionicons
                  name="business"
                  size={20}
                  color={selectedSupplier ? Colors.primary : Colors.textSecondary}
                  style={{ marginRight: 8 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.supplierTriggerText,
                      !supplierName && { color: Colors.textMuted },
                    ]}
                    numberOfLines={1}
                  >
                    {supplierName || (language === 'hi' ? 'सप्लायर ड्रॉपडाउन से चुनें...' : 'Choose supplier from dropdown...')}
                  </Text>
                  {selectedSupplier ? (
                    <Text style={styles.supplierTriggerSub} numberOfLines={1}>
                      {selectedSupplier.phone ? `📞 ${selectedSupplier.phone}` : ''}
                      {selectedSupplier.address ? ` • 📍 ${selectedSupplier.address}` : ''}
                      {selectedSupplier.currentOutstandingPaise > 0
                        ? ` • उधार: ${formatCurrency(selectedSupplier.currentOutstandingPaise)}`
                        : ''}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {supplierName ? (
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      setSelectedSupplierId('');
                      setSupplierName('');
                      setSupplierDropdownOpen(true);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                ) : null}
                <Ionicons
                  name={supplierDropdownOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.textSecondary}
                />
              </View>
            </TouchableOpacity>

            {/* Dropdown Panel */}
            {supplierDropdownOpen && (
              <View style={styles.supplierDropdownCard}>
                {/* Search Bar inside dropdown */}
                <View style={styles.supplierSearchWrap}>
                  <Ionicons name="search" size={15} color={Colors.textSecondary} style={{ marginRight: 6 }} />
                  <TextInput
                    style={styles.supplierSearchInput}
                    placeholder={language === 'hi' ? 'सप्लायर का नाम या फोन नंबर खोजें...' : 'Search supplier or phone...'}
                    placeholderTextColor="#94A3B8"
                    value={supplierSearch}
                    onChangeText={setSupplierSearch}
                    autoFocus={Platform.OS === 'web'}
                  />
                  {supplierSearch ? (
                    <TouchableOpacity onPress={() => setSupplierSearch('')}>
                      <Ionicons name="close" size={16} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Supplier Items List */}
                <ScrollView
                  style={{ maxHeight: 220 }}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {filteredSuppliers.map((s) => {
                    const isSel = selectedSupplierId === s.id || supplierName === s.name;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.supplierItemRow, isSel && styles.supplierItemRowActive]}
                        onPress={() => {
                          setSelectedSupplierId(s.id);
                          setSupplierName(s.name);
                          setSupplierDropdownOpen(false);
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.supplierItemName, isSel && styles.supplierItemNameActive]}>
                            {s.name}
                          </Text>
                          <Text style={styles.supplierItemSub}>
                            {s.phone ? `📞 ${s.phone}` : ''}
                            {s.address ? ` • 📍 ${s.address}` : ''}
                          </Text>
                        </View>

                        {s.currentOutstandingPaise > 0 && (
                          <View style={styles.supplierDueBadge}>
                            <Text style={styles.supplierDueText}>
                              उधार: {formatCurrency(s.currentOutstandingPaise)}
                            </Text>
                          </View>
                        )}

                        {isSel && (
                          <Ionicons name="checkmark-circle" size={18} color={Colors.primary} style={{ marginLeft: 6 }} />
                        )}
                      </TouchableOpacity>
                    );
                  })}

                  {filteredSuppliers.length === 0 && (
                    <View style={styles.noSupplierFoundBox}>
                      <Text style={styles.noSupplierFoundText}>
                        {language === 'hi' ? 'कोई सप्लायर नहीं मिला।' : 'No supplier found.'}
                      </Text>
                    </View>
                  )}

                  {/* Add New Custom Supplier Option */}
                  {supplierSearch.trim() && !suppliers.some(s => s.name.toLowerCase() === supplierSearch.trim().toLowerCase()) && (
                    <TouchableOpacity
                      style={styles.addNewSupplierRow}
                      onPress={() => {
                        setSupplierName(supplierSearch.trim());
                        setSelectedSupplierId('');
                        setSupplierDropdownOpen(false);
                      }}
                    >
                      <Ionicons name="add-circle" size={18} color="#166534" />
                      <Text style={styles.addNewSupplierText}>
                        {language === 'hi'
                          ? `+ नया सप्लायर "${supplierSearch.trim()}" जोड़ें`
                          : `+ Use new "${supplierSearch.trim()}"`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>
              </View>
            )}
          </View>

          <Input
            label={language === 'hi' ? 'सप्लायर / डीलर का नाम (सत्यापित करें या बदलें) *' : 'Supplier / Dealer Name *'}
            placeholder="उदा. श्रीराम कृषि केंद्र, बायर एजेंसी"
            value={supplierName}
            onChangeText={(txt) => {
              setSupplierName(txt);
              const matched = suppliers.find((s) => s.name.toLowerCase() === txt.trim().toLowerCase());
              setSelectedSupplierId(matched ? matched.id : '');
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
              <DatePickerField
                label={language === 'hi' ? 'बिल तारीख *' : 'Invoice Date *'}
                value={invoiceDate}
                onChange={setInvoiceDate}
                containerStyle={{ marginBottom: 0 }}
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
                      {item.gstPercent > 0 ? ` (GST ${item.gstPercent}%)` : ' (बिना GST)'}
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
              {isGstInvoice ? (
                <>
                  <View style={styles.summaryLine}>
                    <Text style={styles.summaryLabel}>{language === 'hi' ? 'कुल बेस राशि:' : 'Subtotal:'}</Text>
                    <Text style={styles.summaryVal}>{formatCurrency(subtotalPaise)}</Text>
                  </View>
                  <View style={styles.summaryLine}>
                    <Text style={styles.summaryLabel}>{language === 'hi' ? 'कुल GST टैक्स:' : 'Total GST:'}</Text>
                    <Text style={styles.summaryVal}>{formatCurrency(gstAmountPaise)}</Text>
                  </View>
                </>
              ) : (
                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>{language === 'hi' ? 'बिल प्रकार:' : 'Bill Mode:'}</Text>
                  <Text style={[styles.summaryVal, { color: '#B45309', fontWeight: '700' }]}>
                    📄 {language === 'hi' ? 'बिना GST बिल (0% टैक्स)' : 'Non-GST (0% Tax)'}
                  </Text>
                </View>
              )}
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

            {/* Bill Photo / Document Attachment */}
            <View style={styles.photoUploadArea}>
              <Text style={styles.fieldSubLabel}>
                {language === 'hi' ? 'डीलर का बिल / चालान (Photo / PDF)' : 'Dealer Bill Attachment (Photo / PDF)'}
              </Text>

              {uploadingFile && (
                <View style={styles.uploadingBox}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.uploadingText}>
                    {language === 'hi' ? 'फ़ोटो प्रोसेस एवं संकुचित हो रही है...' : 'Processing & optimizing bill image...'}
                  </Text>
                </View>
              )}

              {billPhotoUri ? (
                <View style={styles.attachedFileBox}>
                  {billFileType === 'image' ? (
                    <View style={styles.attachedImageWrapper}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setViewBillModalVisible(true)}
                        style={styles.thumbnailContainer}
                      >
                        <Image source={{ uri: billPhotoUri }} style={styles.billPreviewImage} resizeMode="cover" />
                        <View style={styles.zoomHintBadge}>
                          <Ionicons name="expand" size={12} color="#FFFFFF" />
                        </View>
                      </TouchableOpacity>
                      <View style={styles.attachedInfoCol}>
                        <Text style={styles.attachedFileName} numberOfLines={1}>
                          📷 {billFileName || (language === 'hi' ? 'बिल फोटो' : 'Bill Photo')}
                        </Text>
                        <Text style={styles.attachedFileSuccess}>
                          ✓ {language === 'hi' ? 'फ़ोटो सुरक्षित है' : 'Image Attached'}
                        </Text>
                        <View style={styles.attachedActionsRow}>
                          <TouchableOpacity
                            style={styles.viewBillActionBtn}
                            onPress={() => setViewBillModalVisible(true)}
                          >
                            <Ionicons name="eye-outline" size={14} color="#059669" />
                            <Text style={styles.viewBillActionText}>
                              {language === 'hi' ? 'बिल देखें' : 'View Bill'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.changeFileBtn} onPress={() => handlePickFile(false)}>
                            <Text style={styles.changeFileBtnText}>
                              {language === 'hi' ? 'बदलें' : 'Change'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.removeFileBtn}
                            onPress={() => {
                              setBillPhotoUri('');
                              setBillFileName('');
                            }}
                          >
                            <Text style={styles.removeFileBtnText}>
                              {language === 'hi' ? 'हटाएं' : 'Remove'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.attachedPdfWrapper}>
                      <TouchableOpacity activeOpacity={0.8} onPress={() => setViewBillModalVisible(true)}>
                        <Ionicons name="document-text" size={36} color="#DC2626" />
                      </TouchableOpacity>
                      <View style={styles.attachedInfoCol}>
                        <Text style={styles.attachedFileName} numberOfLines={1}>
                          📄 {billFileName || 'Bill_Document.pdf'}
                        </Text>
                        <Text style={styles.attachedFileSuccess}>
                          ✓ {language === 'hi' ? 'PDF दस्तावेज़ जुड़ा है' : 'PDF Attached'}
                        </Text>
                        <View style={styles.attachedActionsRow}>
                          <TouchableOpacity
                            style={styles.viewBillActionBtn}
                            onPress={() => setViewBillModalVisible(true)}
                          >
                            <Ionicons name="eye-outline" size={14} color="#059669" />
                            <Text style={styles.viewBillActionText}>
                              {language === 'hi' ? 'बिल देखें' : 'View Bill'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.changeFileBtn} onPress={() => handlePickFile(false)}>
                            <Text style={styles.changeFileBtnText}>
                              {language === 'hi' ? 'बदलें' : 'Change'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.removeFileBtn}
                            onPress={() => {
                              setBillPhotoUri('');
                              setBillFileName('');
                            }}
                          >
                            <Text style={styles.removeFileBtnText}>
                              {language === 'hi' ? 'हटाएं' : 'Remove'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.uploadOptionsRow}>
                  <TouchableOpacity
                    style={[styles.uploadActionBtn, { backgroundColor: '#EEF2FF', borderColor: Colors.primary }]}
                    onPress={() => handlePickFile(true)}
                  >
                    <Ionicons name="camera" size={20} color={Colors.primary} />
                    <Text style={[styles.uploadActionText, { color: Colors.primary }]}>
                      {language === 'hi' ? 'कैमरा से फोटो खींचें' : 'Take Photo'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.uploadActionBtn, { backgroundColor: '#F0FDF4', borderColor: '#16A34A' }]}
                    onPress={() => handlePickFile(false)}
                  >
                    <Ionicons name="document-attach" size={20} color="#16A34A" />
                    <Text style={[styles.uploadActionText, { color: '#16A34A' }]}>
                      {language === 'hi' ? 'गैलरी / PDF चुनें' : 'Gallery / PDF'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
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
                ? (language === 'hi' ? 'सुरक्षित हो रहा है...' : 'Saving...')
                : editInvoice
                ? (language === 'hi' ? 'परिवर्तन सुरक्षित करें (Update Bill)' : 'Update Purchase Bill')
                : (language === 'hi' ? 'खरीद बिल सुरक्षित करें (Save Bill)' : 'Save Purchase Bill')
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

            {/* Bill Tax Mode Indicator inside Modal */}
            <View style={[styles.modalModeNotice, isGstInvoice ? styles.modalModeNoticeGst : styles.modalModeNoticeNonGst]}>
              <Ionicons
                name={isGstInvoice ? 'shield-checkmark' : 'document-text'}
                size={14}
                color={isGstInvoice ? '#4F46E5' : '#D97706'}
              />
              <Text style={[styles.modalModeNoticeText, { color: isGstInvoice ? '#3730A3' : '#92400E' }]}>
                {isGstInvoice
                  ? (language === 'hi' ? 'जीएसटी बिल प्रविष्टि: उत्पाद का GST स्लैब स्वतः लागू होगा।' : 'GST Invoice: Applicable GST slab will be loaded.')
                  : (language === 'hi' ? 'बिना जीएसटी बिल (कच्चा): 0% टैक्स, केवल बेस खरीद दर लागू होगी।' : 'Non-GST Invoice: 0% Tax, flat base rate applied.')}
              </Text>
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
                        const displayPrice = isGstInvoice
                          ? (p.withGstRatePaise || Math.round(p.billingRatePaise * (1 + (p.gstPercent ?? 18) / 100)))
                          : p.billingRatePaise;
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
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={styles.prodSelectPrice}>
                                {formatCurrency(displayPrice)}
                              </Text>
                              <Text style={[styles.prodSelectTaxBadge, { color: isGstInvoice ? '#4F46E5' : '#D97706' }]}>
                                {isGstInvoice ? `GST ${p.gstPercent ?? 18}% सहित` : 'बिना GST दर'}
                              </Text>
                            </View>
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
                        label={
                          isGstInvoice
                            ? (language === 'hi' ? 'खरीद दर - बिना GST (₹) *' : 'Rate without GST (₹) *')
                            : (language === 'hi' ? 'खरीद दर - 0% Tax (₹) *' : 'Base Rate - 0% Tax (₹) *')
                        }
                        placeholder="0.00"
                        value={billingRate}
                        onChangeText={setBillingRate}
                        keyboardType="decimal-pad"
                        prefix="₹"
                      />
                    </View>
                  </View>

                  {/* GST Slab Selector or Non-GST Notice */}
                  {isGstInvoice ? (
                    <View style={{ marginVertical: Spacing.xs }}>
                      <Text style={styles.fieldSubLabel}>
                        {language === 'hi' ? 'GST टैक्स स्लैब:' : 'GST Tax Slab:'}
                      </Text>
                      <View style={styles.gstSlabRow}>
                        {[0, 5, 12, 18, 28].map((slab) => {
                          const isSel = gstPercent === slab;
                          return (
                            <TouchableOpacity
                              key={`slab_${slab}`}
                              style={[styles.gstSlabChip, isSel && styles.gstSlabChipActive]}
                              onPress={() => setGstPercent(slab)}
                            >
                              <Text style={[styles.gstSlabChipText, isSel && styles.gstSlabChipTextActive]}>
                                {slab}%
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {parseFloat(billingRate) > 0 && (
                        <View style={styles.rateCalcNotice}>
                          <Ionicons name="calculator" size={14} color="#4F46E5" />
                          <Text style={styles.rateCalcNoticeText}>
                            बेस दर: ₹{parseFloat(billingRate).toFixed(2)} + GST ({gstPercent}% = ₹{(parseFloat(billingRate) * (gstPercent / 100)).toFixed(2)}) ={' '}
                            <Text style={{ fontWeight: '800', color: '#1E1B4B' }}>
                              ₹{(parseFloat(billingRate) * (1 + gstPercent / 100)).toFixed(2)} / {selectedProduct.primarySellingUnit || selectedProduct.unit || 'यूनिट'} (GST सहित)
                            </Text>
                          </Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={styles.nonGstItemNotice}>
                      <Ionicons name="checkmark-circle" size={15} color="#15803D" />
                      <Text style={styles.nonGstItemNoticeText}>
                        {language === 'hi'
                          ? 'बिना GST बिल: 0% टैक्स लागू। बेस खरीद दर ही अंतिम दर होगी।'
                          : 'Non-GST Bill: 0% Tax applied. Base rate is final.'}
                      </Text>
                    </View>
                  )}

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

      {/* Full-Screen Bill Preview Modal (View Bill Option) */}
      <Modal
        visible={viewBillModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setViewBillModalVisible(false)}
      >
        <View style={styles.billPreviewOverlay}>
          <View style={styles.billPreviewModal}>
            <View style={styles.billPreviewHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.billPreviewTitle}>
                  {billFileType === 'pdf' ? '📄 डीलर बिल (PDF)' : '📷 डीलर बिल (Photo)'}
                </Text>
                <Text style={styles.billPreviewSubtitle} numberOfLines={1}>
                  {billFileName || (billFileType === 'pdf' ? 'dealer_bill.pdf' : 'dealer_bill.jpg')}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.billPreviewCloseBtn}
                onPress={() => setViewBillModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={28} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.billPreviewBody}>
              {billFileType === 'image' && billPhotoUri ? (
                <ScrollView
                  style={{ flex: 1, width: '100%' }}
                  contentContainerStyle={{ alignItems: 'center', justifyContent: 'center', minHeight: '100%' }}
                  maximumZoomScale={3}
                  minimumZoomScale={1}
                >
                  <Image
                    source={{ uri: billPhotoUri }}
                    style={styles.billPreviewFullImage}
                    resizeMode="contain"
                  />
                </ScrollView>
              ) : billFileType === 'pdf' && billPhotoUri ? (
                <View style={styles.billPreviewPdfBox}>
                  <Ionicons name="document-text" size={68} color="#DC2626" />
                  <Text style={styles.billPreviewPdfName}>
                    {billFileName || 'Dealer_Bill_Document.pdf'}
                  </Text>
                  <Text style={styles.billPreviewPdfHint}>
                    {language === 'hi'
                      ? 'PDF दस्तावेज़ सुरक्षित रूप से जुड़ा हुआ है। बड़ी स्क्रीन में देखने या प्रिंट करने हेतु नीचे दिए बटन पर टैप करें।'
                      : 'PDF Document attached safely. Tap below to view or print in full window.'}
                  </Text>
                  <TouchableOpacity
                    style={styles.openExternalBtn}
                    onPress={() => openInNewWindowSafe(billPhotoUri, true, billFileName)}
                  >
                    <Ionicons name="open-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.openExternalBtnText}>
                      {language === 'hi' ? 'अलग विंडो में PDF खोलें' : 'Open PDF in New Window'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ alignItems: 'center', justifyContent: 'center', padding: Spacing.xl }}>
                  <Text style={{ color: '#94A3B8' }}>
                    {language === 'hi' ? 'कोई फ़ाइल संलग्न नहीं है' : 'No file attached'}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.billPreviewFooter}>
              {billFileType === 'image' && billPhotoUri && (
                <TouchableOpacity
                  style={styles.billPreviewExternalBtn}
                  onPress={() => openInNewWindowSafe(billPhotoUri, false, billFileName)}
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
                onPress={() => setViewBillModalVisible(false)}
                style={{ flex: 1, backgroundColor: '#FFFFFF' }}
              />
            </View>
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
    marginBottom: Spacing.md,
  },
  uploadOptionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  uploadActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    gap: 6,
  },
  uploadActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  attachedFileBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing.sm,
  },
  attachedImageWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  billPreviewImage: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#E2E8F0',
  },
  attachedPdfWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  attachedInfoCol: {
    flex: 1,
  },
  attachedFileName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  attachedFileSuccess: {
    fontSize: 11,
    fontWeight: '600',
    color: '#16A34A',
    marginTop: 2,
  },
  attachedActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  changeFileBtn: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  changeFileBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  removeFileBtn: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  removeFileBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  thumbnailContainer: {
    position: 'relative',
  },
  zoomHintBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderRadius: 4,
    padding: 2,
  },
  viewBillActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  viewBillActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  uploadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  uploadingText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
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
  // Tax Mode Toggle & Notice styles
  taxModeContainer: {
    marginBottom: Spacing.sm,
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  taxToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 6,
  },
  taxToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  taxToggleBtnActiveGst: {
    backgroundColor: '#4F46E5',
    borderColor: '#4338CA',
  },
  taxToggleBtnActiveNonGst: {
    backgroundColor: '#D97706',
    borderColor: '#B45309',
  },
  taxToggleTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  taxToggleTitleActive: {
    color: '#FFFFFF',
  },
  taxToggleSub: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  taxToggleSubActive: {
    color: '#E0E7FF',
  },
  taxNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  taxNoticeBoxGst: {
    backgroundColor: '#EEF2FF',
    borderLeftWidth: 3,
    borderLeftColor: '#4F46E5',
  },
  taxNoticeBoxNonGst: {
    backgroundColor: '#FEF3C7',
    borderLeftWidth: 3,
    borderLeftColor: '#D97706',
  },
  taxNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
  prodSelectTaxBadge: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  modalModeNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  modalModeNoticeGst: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  modalModeNoticeNonGst: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  modalModeNoticeText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
  },
  gstSlabRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    marginBottom: 6,
  },
  gstSlabChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  gstSlabChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4338CA',
  },
  gstSlabChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  gstSlabChipTextActive: {
    color: '#FFFFFF',
  },
  rateCalcNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    padding: 8,
    borderRadius: BorderRadius.sm,
    marginTop: 4,
  },
  rateCalcNoticeText: {
    fontSize: 11,
    color: '#3730A3',
    lineHeight: 16,
  },
  nonGstItemNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    padding: 8,
    borderRadius: BorderRadius.sm,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  nonGstItemNoticeText: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '700',
  },
  // Supplier Dropdown Styles
  supplierDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: Spacing.xs,
  },
  supplierDropdownTriggerOpen: {
    borderColor: Colors.primary,
    backgroundColor: '#F8FAFC',
  },
  supplierDropdownTriggerSelected: {
    borderColor: '#93C5FD',
    backgroundColor: '#F0F9FF',
  },
  supplierTriggerText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  supplierTriggerSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  supplierDropdownCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.xs,
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  supplierSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: Spacing.xs,
  },
  supplierSearchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
    padding: 0,
  },
  supplierItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    borderRadius: BorderRadius.sm,
  },
  supplierItemRowActive: {
    backgroundColor: '#EEF2FF',
  },
  supplierItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  supplierItemNameActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  supplierItemSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  supplierDueBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  supplierDueText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
  },
  noSupplierFoundBox: {
    padding: Spacing.sm,
    alignItems: 'center',
  },
  noSupplierFoundText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  addNewSupplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#F0FDF4',
    borderRadius: BorderRadius.sm,
    marginTop: 4,
  },
  addNewSupplierText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
});
