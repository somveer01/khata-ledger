import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
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
import { Product, ProductCategory } from '../../types';
import { toPaise, toRupees, formatCurrency } from '../../utils/money';
import { showAlert } from '../../utils/dialog';

const CATEGORIES: { key: ProductCategory; labelHi: string; labelEn: string }[] = [
  { key: 'PESTICIDE', labelHi: 'कीटनाशक (Pesticide)', labelEn: 'Pesticide' },
  { key: 'INSECTICIDE', labelHi: 'इन्सेक्टिसाइड (Insecticide)', labelEn: 'Insecticide' },
  { key: 'FUNGICIDE', labelHi: 'फफूंदनाशक (Fungicide)', labelEn: 'Fungicide' },
  { key: 'HERBICIDE', labelHi: 'खरपतवारनाशक (Herbicide)', labelEn: 'Herbicide' },
  { key: 'SEED', labelHi: 'बीज (Seed)', labelEn: 'Seed' },
  { key: 'FERTILIZER', labelHi: 'खाद (Fertilizer)', labelEn: 'Fertilizer' },
  { key: 'OTHER', labelHi: 'अन्य (Other)', labelEn: 'Other' },
];

const GST_SLABS = [0, 5, 12, 18, 28];

export const AddEditProductScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { business, language } = useApp();

  const existingProduct: Product | undefined = route.params?.product;
  const isEditing = !!existingProduct;

  // Form Fields
  const [brandName, setBrandName] = useState(existingProduct?.brandName || '');
  const [productName, setProductName] = useState(existingProduct?.productName || '');
  const [technicalName, setTechnicalName] = useState(existingProduct?.technicalName || '');
  const [category, setCategory] = useState<ProductCategory>(existingProduct?.category || 'PESTICIDE');
  const [packSize, setPackSize] = useState(existingProduct?.packSize || '');
  const [casePacking, setCasePacking] = useState(existingProduct?.casePacking || '');
  const [unit, setUnit] = useState(existingProduct?.unit || 'Bottle');

  // Rate calculator fields
  const [billingRate, setBillingRate] = useState<string>(
    existingProduct ? (toRupees(existingProduct.billingRatePaise) || '').toString() : ''
  );
  const [gstPercent, setGstPercent] = useState<number>(existingProduct?.gstPercent ?? 18);
  const [marginPercent, setMarginPercent] = useState<string>(
    existingProduct?.marginPercent !== undefined ? existingProduct.marginPercent.toString() : '10'
  );
  const [sellingRate, setSellingRate] = useState<string>(
    existingProduct ? (toRupees(existingProduct.sellingRatePaise) || '').toString() : ''
  );
  const [isSellingRateManual, setIsSellingRateManual] = useState<boolean>(false);
  const [notes, setNotes] = useState(existingProduct?.notes || '');
  const [saving, setSaving] = useState(false);

  // Auto-sync rates
  // When billingRate or gstPercent changes
  useEffect(() => {
    const bRate = parseFloat(billingRate) || 0;
    const withGst = bRate * (1 + gstPercent / 100);

    if (!isSellingRateManual) {
      const margin = parseFloat(marginPercent) || 0;
      const calculatedSelling = withGst * (1 + margin / 100);
      setSellingRate(calculatedSelling > 0 ? (Math.round(calculatedSelling * 100) / 100).toFixed(2) : '');
    }
  }, [billingRate, gstPercent, marginPercent, isSellingRateManual]);

  // Handle direct manual change to Selling Rate
  const handleSellingRateChange = (text: string) => {
    setSellingRate(text);
    setIsSellingRateManual(true);
    const sRate = parseFloat(text) || 0;
    const bRate = parseFloat(billingRate) || 0;
    const withGst = bRate * (1 + gstPercent / 100);

    if (withGst > 0 && sRate > 0) {
      const calculatedMargin = ((sRate - withGst) / withGst) * 100;
      setMarginPercent((Math.round(calculatedMargin * 10) / 10).toString());
    }
  };

  // Handle change to Margin %
  const handleMarginChange = (text: string) => {
    setMarginPercent(text);
    setIsSellingRateManual(false);
  };

  // Computed display values
  const bRateNum = parseFloat(billingRate) || 0;
  const withGstNum = Math.round(bRateNum * (1 + gstPercent / 100) * 100) / 100;
  const sellingNum = parseFloat(sellingRate) || 0;
  const profitPerUnit = Math.round((sellingNum - withGstNum) * 100) / 100;

  const handleSave = async () => {
    if (!business) return;

    if (!brandName.trim()) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'कृपया ब्रांड का नाम दर्ज करें।' : 'Please enter brand name.', undefined, 'danger');
      return;
    }
    if (!productName.trim()) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'कृपया उत्पाद का नाम दर्ज करें।' : 'Please enter product name.', undefined, 'danger');
      return;
    }
    if (!packSize.trim()) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'कृपया पैकिंग साइज़ (उदा. 500 ML, 1 KG) दर्ज करें।' : 'Please enter pack size.', undefined, 'danger');
      return;
    }
    if (bRateNum <= 0) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'कृपया सही खरीद दर (बिलिंग रेट) दर्ज करें।' : 'Please enter billing rate.', undefined, 'danger');
      return;
    }
    if (sellingNum <= 0) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'कृपया सही बिक्री दर (Selling Rate) दर्ज करें।' : 'Please enter selling rate.', undefined, 'danger');
      return;
    }

    setSaving(true);
    try {
      const productToSave: Product = {
        id: existingProduct?.id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        businessId: business.id,
        brandName: brandName.trim().toUpperCase(),
        productName: productName.trim(),
        technicalName: technicalName.trim() || '',
        category,
        packSize: packSize.trim(),
        casePacking: casePacking.trim() || '',
        unit: unit.trim() || 'Bottle',
        billingRatePaise: toPaise(bRateNum),
        gstPercent,
        withGstRatePaise: toPaise(withGstNum),
        marginPercent: parseFloat(marginPercent) || 0,
        sellingRatePaise: toPaise(sellingNum),
        notes: notes.trim() || '',
        isActive: true,
        createdAt: existingProduct?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = await DataRepository.saveProduct(productToSave);
      if (res.success) {
        showAlert(
          language === 'hi' ? 'सफल' : 'Success',
          language === 'hi'
            ? isEditing
              ? 'उत्पाद सफलतापूर्वक अपडेट हुआ!'
              : 'नया उत्पाद सफलतापूर्वक सुरक्षित हुआ!'
            : isEditing
            ? 'Product updated successfully!'
            : 'Product saved successfully!',
          () => navigation.goBack(),
          'success'
        );
      } else {
        showAlert(language === 'hi' ? 'त्रुटि' : 'Error', res.error || 'Failed to save product', undefined, 'danger');
      }
    } catch (err: any) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', err.message || 'Error saving product', undefined, 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title={
          isEditing
            ? language === 'hi'
              ? 'उत्पाद बदलें (Edit)'
              : 'Edit Product'
            : language === 'hi'
            ? 'नया उत्पाद जोड़ें'
            : 'Add Product'
        }
        subtitle={brandName || (language === 'hi' ? 'रेट एवं मार्जिन सेटअप' : 'Rate & Margin Setup')}
        showBack
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Section 1: Identification */}
        <Card style={styles.card}>
          <Text style={styles.sectionHeader}>
            🏷️ {language === 'hi' ? 'उत्पाद की पहचान' : 'Product Identification'}
          </Text>

          {/* Category Selector Chips */}
          <Text style={styles.fieldLabel}>{language === 'hi' ? 'श्रेणी (Category)' : 'Category'}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catChipsRow}>
            {CATEGORIES.map((cat) => {
              const isSelected = category === cat.key;
              return (
                <TouchableOpacity
                  key={cat.key}
                  style={[styles.catChip, isSelected && styles.catChipActive]}
                  onPress={() => setCategory(cat.key)}
                >
                  <Text style={[styles.catChipText, isSelected && styles.catChipTextActive]}>
                    {language === 'hi' ? cat.labelHi : cat.labelEn}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Input
            label={language === 'hi' ? 'ब्रांड का नाम (Brand Name) *' : 'Brand Name *'}
            placeholder="उदा. DYCOON, ALPHRON, BAYER"
            value={brandName}
            onChangeText={(txt) => {
              setBrandName(txt);
              if (!productName || productName === brandName) {
                setProductName(txt);
              }
            }}
          />

          <Input
            label={language === 'hi' ? 'उत्पाद का नाम (Product Name) *' : 'Product Name *'}
            placeholder="उदा. DYCOON 400ML, बायर रीजेंट"
            value={productName}
            onChangeText={setProductName}
          />

          <Input
            label={language === 'hi' ? 'टेक्निकल / रासायनिक नाम (Optional)' : 'Technical Name (Optional)'}
            placeholder="उदा. 2,4-D AMINE SALT 58% SL"
            value={technicalName}
            onChangeText={setTechnicalName}
          />
        </Card>

        {/* Section 2: Pack Size */}
        <Card style={styles.card}>
          <Text style={styles.sectionHeader}>
            📦 {language === 'hi' ? 'पैकिंग एवं साइज़' : 'Packaging & Pack Size'}
          </Text>

          <View style={styles.twoColRow}>
            <View style={{ flex: 1.2 }}>
              <Input
                label={language === 'hi' ? 'पैकिंग साइज़ *' : 'Pack Size *'}
                placeholder="उदा. 400 ML, 1 L, 1 KG"
                value={packSize}
                onChangeText={setPackSize}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Input
                label={language === 'hi' ? 'इकाई (Unit)' : 'Unit'}
                placeholder="Bottle/Bag/Pouch"
                value={unit}
                onChangeText={setUnit}
              />
            </View>
          </View>

          <Input
            label={language === 'hi' ? 'पेटी / केस विवरण (Optional)' : 'Case Packing (Optional)'}
            placeholder="उदा. 400ML*20 PCS (8 LIT Case)"
            value={casePacking}
            onChangeText={setCasePacking}
          />
        </Card>

        {/* Section 3: Live Rate & Margin Calculator */}
        <Card style={[styles.card, styles.calculatorCard]}>
          <View style={styles.calcHeaderRow}>
            <Text style={styles.calcTitle}>
              🧮 {language === 'hi' ? 'लाइव रेट एवं मार्जिन कैलकुलेटर' : 'Live Rate Calculator'}
            </Text>
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>Auto-Calculated</Text>
            </View>
          </View>

          {/* Billing Rate Input */}
          <Input
            label={language === 'hi' ? 'खरीद दर - बिना GST (Billing Rate ₹) *' : 'Purchase Rate without GST (₹) *'}
            placeholder="0.00"
            value={billingRate}
            onChangeText={setBillingRate}
            keyboardType="decimal-pad"
            prefix="₹"
          />

          {/* GST Slab Selector */}
          <Text style={styles.fieldLabel}>{language === 'hi' ? 'GST टैक्स दर (%)' : 'GST Slab (%)'}</Text>
          <View style={styles.gstSlabsRow}>
            {GST_SLABS.map((slab) => {
              const isSelected = gstPercent === slab;
              return (
                <TouchableOpacity
                  key={slab}
                  style={[styles.gstChip, isSelected && styles.gstChipActive]}
                  onPress={() => setGstPercent(slab)}
                >
                  <Text style={[styles.gstChipText, isSelected && styles.gstChipTextActive]}>
                    {slab}%
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* With GST Result Banner */}
          <View style={styles.withGstBanner}>
            <View style={styles.withGstCol}>
              <Text style={styles.withGstLabel}>
                {language === 'hi' ? 'खरीद दर (With GST Rate)' : 'Purchase Rate (With GST)'}
              </Text>
              <Text style={styles.withGstValue}>
                {formatCurrency(toPaise(withGstNum))}
              </Text>
            </View>
            <View style={styles.gstBreakupBadge}>
              <Text style={styles.gstBreakupText}>
                +₹{Math.round((withGstNum - bRateNum) * 100) / 100} GST
              </Text>
            </View>
          </View>

          {/* Margin % and Selling Rate */}
          <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>
            {language === 'hi' ? 'बिक्री दर (Selling Rate) निर्धारण:' : 'Selling Rate Setting:'}
          </Text>

          <View style={styles.twoColRow}>
            {/* Margin % */}
            <View style={{ flex: 1 }}>
              <Input
                label={language === 'hi' ? 'मुनाफा / मार्जिन %' : 'Profit Margin %'}
                placeholder="10"
                value={marginPercent}
                onChangeText={handleMarginChange}
                keyboardType="decimal-pad"
                suffix="%"
              />
            </View>

            {/* Selling Rate */}
            <View style={{ flex: 1.2 }}>
              <Input
                label={language === 'hi' ? 'सीधी बिक्री दर (₹) *' : 'Selling Rate (₹) *'}
                placeholder="0.00"
                value={sellingRate}
                onChangeText={handleSellingRateChange}
                keyboardType="decimal-pad"
                prefix="₹"
              />
            </View>
          </View>

          {/* Profit Summary Strip */}
          <View style={styles.profitSummaryBox}>
            <View style={styles.profitItem}>
              <Text style={styles.profitLabel}>{language === 'hi' ? 'प्रति नग मुनाफा:' : 'Profit / Unit:'}</Text>
              <Text
                style={[
                  styles.profitVal,
                  { color: profitPerUnit >= 0 ? '#16A34A' : Colors.danger },
                ]}
              >
                +{formatCurrency(toPaise(profitPerUnit))}
              </Text>
            </View>

            <View style={styles.profitItem}>
              <Text style={styles.profitLabel}>{language === 'hi' ? 'कुल मार्जिन:' : 'Margin:'}</Text>
              <Text
                style={[
                  styles.profitVal,
                  { color: profitPerUnit >= 0 ? '#16A34A' : Colors.danger },
                ]}
              >
                {marginPercent}%
              </Text>
            </View>
          </View>
        </Card>

        {/* Section 4: Notes */}
        <Card style={styles.card}>
          <Input
            label={language === 'hi' ? 'कोई टिप्पणी / नोट (Optional)' : 'Notes / Remarks (Optional)'}
            placeholder="उदा. इस सीजन में विशेष मांग, डिस्ट्रीब्यूटर स्कीम आदि"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={2}
          />
        </Card>

        {/* Save Button */}
        <View style={styles.saveActionArea}>
          <Button
            title={
              saving
                ? language === 'hi'
                  ? 'सुरक्षित हो रहा है...'
                  : 'Saving...'
                : isEditing
                ? language === 'hi'
                  ? 'बदलाव सुरक्षित करें'
                  : 'Update Product'
                : language === 'hi'
                ? 'नया उत्पाद जोड़ें'
                : 'Save Product'
            }
            onPress={handleSave}
            disabled={saving}
            size="lg"
            variant="primary"
          />
        </View>
      </ScrollView>
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
    padding: Spacing.lg,
    paddingBottom: 60,
  },
  card: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  calculatorCard: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  calcHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  calcTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#166534',
  },
  liveBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#166534',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  catChipsRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: '#F1F5F9',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  catChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  catChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  catChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  rupeePrefix: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  suffixText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  gstSlabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.md,
  },
  gstChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  gstChipActive: {
    backgroundColor: '#166534',
    borderColor: '#166534',
  },
  gstChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  gstChipTextActive: {
    color: '#FFFFFF',
  },
  withGstBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    marginBottom: Spacing.xs,
  },
  withGstCol: {
    flex: 1,
  },
  withGstLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  withGstValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#15803D',
    marginTop: 2,
  },
  gstBreakupBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  gstBreakupText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
  },
  profitSummaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  profitItem: {
    alignItems: 'center',
  },
  profitLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  profitVal: {
    fontSize: 14,
    fontWeight: '800',
  },
  saveActionArea: {
    marginTop: Spacing.sm,
  },
});
