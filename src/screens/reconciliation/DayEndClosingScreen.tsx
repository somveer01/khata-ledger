import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  TextInput,
  Platform,
  Share,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { DatePickerField } from '../../components/DatePickerField';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { DataRepository } from '../../services/db';
import {
  DailyCashClosing,
  DailyExpenseItem,
  DailyExpenseCategory,
  CashDenomination,
} from '../../types';
import { formatCurrency, toPaise, toRupees } from '../../utils/money';
import { getTodayIST, formatUpperDate } from '../../utils/date';
import { showAlert, confirmAction } from '../../utils/dialog';

const EXPENSE_CATEGORIES: {
  key: DailyExpenseCategory;
  labelHi: string;
  labelEn: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = [
  { key: 'TEA_SNACKS', labelHi: 'चाय / नाश्ता', labelEn: 'Tea & Snacks', icon: 'cafe', color: '#D97706' },
  { key: 'LABOUR_LOADING', labelHi: 'पल्लेदारी / मजदूरी', labelEn: 'Labour & Loading', icon: 'people', color: '#2563EB' },
  { key: 'FREIGHT_TRANSPORT', labelHi: 'भाड़ा / ढुलाई', labelEn: 'Freight / Transport', icon: 'car', color: '#7C3AED' },
  { key: 'ELECTRICITY_FUEL', labelHi: 'बिजली / डीज़ल', labelEn: 'Fuel / Electricity', icon: 'flash', color: '#DC2626' },
  { key: 'PERSONAL_DRAWING', labelHi: 'मालिक खर्च (निजी)', labelEn: 'Owner Drawing', icon: 'wallet', color: '#059669' },
  { key: 'OTHER', labelHi: 'अन्य दुकान खर्च', labelEn: 'Other Expense', icon: 'receipt', color: '#4B5563' },
];

export const DayEndClosingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { business, language } = useApp();

  const [targetDate, setTargetDate] = useState<string>(getTodayIST());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Live Summary from Database
  const [summary, setSummary] = useState<{
    openingCashPaise: number;
    cashSalesPaise: number;
    cashRecoveriesPaise: number;
    cashSupplierPaidPaise: number;
    cashExpensesPaise: number;
    expectedCashPaise: number;
    upiSalesPaise: number;
    upiRecoveriesPaise: number;
    upiExpensesPaise: number;
    creditSalesPaise: number;
    totalDaySalesPaise: number;
    totalDayCollectionsPaise: number;
    existingClosing: DailyCashClosing | null;
  }>({
    openingCashPaise: 0,
    cashSalesPaise: 0,
    cashRecoveriesPaise: 0,
    cashSupplierPaidPaise: 0,
    cashExpensesPaise: 0,
    expectedCashPaise: 0,
    upiSalesPaise: 0,
    upiRecoveriesPaise: 0,
    upiExpensesPaise: 0,
    creditSalesPaise: 0,
    totalDaySalesPaise: 0,
    totalDayCollectionsPaise: 0,
    existingClosing: null,
  });

  // Manual Overrides / Inputs
  const [customOpeningCash, setCustomOpeningCash] = useState<string>('0');
  const [isEditingOpening, setIsEditingOpening] = useState(false);

  // Denominations State
  const [n500, setN500] = useState('');
  const [n200, setN200] = useState('');
  const [n100, setN100] = useState('');
  const [n50, setN50] = useState('');
  const [n20, setN20] = useState('');
  const [n10, setN10] = useState('');
  const [coinsRupees, setCoinsRupees] = useState('');
  const [varianceReason, setVarianceReason] = useState('');

  // Daily Expenses
  const [expenses, setExpenses] = useState<DailyExpenseItem[]>([]);
  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [expCategory, setExpCategory] = useState<DailyExpenseCategory>('TEA_SNACKS');
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expMethod, setExpMethod] = useState<'CASH' | 'UPI'>('CASH');
  const [expPaidTo, setExpPaidTo] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);

  // History Modal
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [closingHistory, setClosingHistory] = useState<DailyCashClosing[]>([]);

  const loadData = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      const [resSummary, expList] = await Promise.all([
        DataRepository.calculateDailyCashSummary(business.id, targetDate),
        DataRepository.getDailyExpenses(business.id, targetDate),
      ]);

      setSummary(resSummary);
      setExpenses(expList);

      if (resSummary.existingClosing) {
        const c = resSummary.existingClosing;
        setCustomOpeningCash(toRupees(c.openingCashPaise).toString());
        setN500(c.denominations.note500 ? c.denominations.note500.toString() : '');
        setN200(c.denominations.note200 ? c.denominations.note200.toString() : '');
        setN100(c.denominations.note100 ? c.denominations.note100.toString() : '');
        setN50(c.denominations.note50 ? c.denominations.note50.toString() : '');
        setN20(c.denominations.note20 ? c.denominations.note20.toString() : '');
        setN10(c.denominations.note10 ? c.denominations.note10.toString() : '');
        setCoinsRupees(c.denominations.coins ? c.denominations.coins.toString() : '');
        setVarianceReason(c.varianceReason || '');
      } else {
        setCustomOpeningCash(toRupees(resSummary.openingCashPaise).toString());
        // Reset denominations for fresh date
        setN500('');
        setN200('');
        setN100('');
        setN50('');
        setN20('');
        setN10('');
        setCoinsRupees('');
        setVarianceReason('');
      }
    } catch (err) {
      console.warn('Error loading daily cash summary:', err);
    } finally {
      setLoading(false);
    }
  }, [business?.id, targetDate]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Calculate Physical Counted Cash
  const physicalTotalPaise = useMemo(() => {
    const c500 = (parseInt(n500, 10) || 0) * 500;
    const c200 = (parseInt(n200, 10) || 0) * 200;
    const c100 = (parseInt(n100, 10) || 0) * 100;
    const c50 = (parseInt(n50, 10) || 0) * 50;
    const c20 = (parseInt(n20, 10) || 0) * 20;
    const c10 = (parseInt(n10, 10) || 0) * 10;
    const cCoins = parseFloat(coinsRupees) || 0;
    return toPaise(c500 + c200 + c100 + c50 + c20 + c10 + cCoins);
  }, [n500, n200, n100, n50, n20, n10, coinsRupees]);

  // Dynamic Expected Cash (uses custom opening cash if edited)
  const effectiveOpeningPaise = useMemo(() => {
    const parsed = parseFloat(customOpeningCash);
    return isNaN(parsed) ? 0 : toPaise(parsed);
  }, [customOpeningCash]);

  const effectiveExpectedCashPaise = useMemo(() => {
    return Math.max(
      0,
      effectiveOpeningPaise +
        summary.cashSalesPaise +
        summary.cashRecoveriesPaise -
        summary.cashSupplierPaidPaise -
        summary.cashExpensesPaise
    );
  }, [effectiveOpeningPaise, summary]);

  // Variance = Physical - Expected
  const variancePaise = physicalTotalPaise - effectiveExpectedCashPaise;
  const isMatch = variancePaise === 0 && physicalTotalPaise > 0;
  const isShortage = variancePaise < 0 && physicalTotalPaise > 0;
  const isSurplus = variancePaise > 0;

  // Add / Save Expense
  const handleSaveExpense = async () => {
    if (!business) return;
    const amountVal = parseFloat(expAmount);
    if (!amountVal || amountVal <= 0) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'कृपया मान्य खर्च राशि दर्ज करें।' : 'Please enter valid amount.', undefined, 'danger');
      return;
    }

    setSavingExpense(true);
    try {
      const expenseItem: DailyExpenseItem = {
        id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        businessId: business.id,
        date: targetDate,
        category: expCategory,
        title: expTitle.trim() || EXPENSE_CATEGORIES.find((c) => c.key === expCategory)?.labelHi || 'दुकान खर्च',
        amountPaise: toPaise(amountVal),
        paymentMethod: expMethod,
        paidTo: expPaidTo.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      const res = await DataRepository.saveDailyExpense(expenseItem);
      if (res.success) {
        setExpenseModalVisible(false);
        setExpAmount('');
        setExpTitle('');
        setExpPaidTo('');
        loadData();
      } else {
        showAlert(language === 'hi' ? 'त्रुटि' : 'Error', res.error || 'Failed to save expense', undefined, 'danger');
      }
    } catch (err: any) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', err.message, undefined, 'danger');
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = (id: string) => {
    if (!business) return;
    confirmAction(
      language === 'hi' ? 'खर्चा हटाएं?' : 'Delete Expense?',
      language === 'hi' ? 'क्या आप इस खर्चे को हटाना चाहते हैं?' : 'Remove this expense?',
      async () => {
        await DataRepository.deleteDailyExpense(business.id, id);
        loadData();
      }
    );
  };

  // Lock & Save Closing
  const handleLockClosing = async () => {
    if (!business) return;

    if (physicalTotalPaise === 0) {
      confirmAction(
        language === 'hi' ? 'नोट गिनती शून्य है' : 'Zero Cash Count',
        language === 'hi'
          ? 'आपने कोई भी नोट/कैश नहीं गिना है। क्या आप ₹0 के साथ दिन बंद करना चाहते हैं?'
          : 'Total counted cash is ₹0. Do you want to close the day with ₹0?',
        () => executeSaveClosing()
      );
      return;
    }

    executeSaveClosing();
  };

  const executeSaveClosing = async () => {
    if (!business) return;
    setSaving(true);
    try {
      const closingPayload: DailyCashClosing = {
        id: `close_${targetDate}`,
        businessId: business.id,
        date: targetDate,
        closedAt: new Date().toISOString(),
        closedBy: business.ownerName || 'Owner',

        openingCashPaise: effectiveOpeningPaise,
        cashSalesPaise: summary.cashSalesPaise,
        cashRecoveriesPaise: summary.cashRecoveriesPaise,
        cashSupplierPaidPaise: summary.cashSupplierPaidPaise,
        cashExpensesPaise: summary.cashExpensesPaise,
        expectedCashPaise: effectiveExpectedCashPaise,

        denominations: {
          note500: parseInt(n500, 10) || 0,
          note200: parseInt(n200, 10) || 0,
          note100: parseInt(n100, 10) || 0,
          note50: parseInt(n50, 10) || 0,
          note20: parseInt(n20, 10) || 0,
          note10: parseInt(n10, 10) || 0,
          coins: parseFloat(coinsRupees) || 0,
        },
        physicalCashPaise: physicalTotalPaise,
        variancePaise: physicalTotalPaise - effectiveExpectedCashPaise,
        varianceReason: varianceReason.trim() || undefined,

        upiSalesPaise: summary.upiSalesPaise,
        upiRecoveriesPaise: summary.upiRecoveriesPaise,
        upiExpensesPaise: summary.upiExpensesPaise,
        creditSalesPaise: summary.creditSalesPaise,
        totalDaySalesPaise: summary.totalDaySalesPaise,
        totalDayCollectionsPaise: summary.totalDayCollectionsPaise,

        isLocked: true,
        createdAt: summary.existingClosing ? summary.existingClosing.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = await DataRepository.saveDailyCashClosing(closingPayload);
      if (res.success) {
        showAlert(
          language === 'hi' ? 'सफल' : 'Success',
          language === 'hi'
            ? `तारीख ${formatUpperDate(targetDate)} का गल्ला हिसाब सुरक्षित एवं लॉक हो गया!`
            : 'Day-end cash closing saved successfully!',
          () => loadData(),
          'success'
        );
      } else {
        showAlert(language === 'hi' ? 'त्रुटि' : 'Error', res.error || 'Failed to save closing', undefined, 'danger');
      }
    } catch (err: any) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', err.message, undefined, 'danger');
    } finally {
      setSaving(false);
    }
  };

  // Generate WhatsApp Closing Digest
  const handleShareWhatsApp = async () => {
    const storeName = business?.name || 'खता बही स्टोर';
    const dateStr = formatUpperDate(targetDate);
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let diffText = 'पूर्ण मिलान (Exact Match) ✓';
    if (isShortage) {
      diffText = `⚠️ कमी (Shortage): -${formatCurrency(Math.abs(variancePaise))}`;
    } else if (isSurplus) {
      diffText = `⚠️ अधिक (Surplus): +${formatCurrency(variancePaise)}`;
    }

    const message =
`*🌾 ${storeName} 🌾*
*📊 दैनिक गल्ला एवं व्यापार क्लोज़िंग रिपोर्ट*
📅 तारीख: ${dateStr} | ⏰ समय: ${timeStr}
━━━━━━━━━━━━━━━━━━
*💵 गल्ला मिलान (Cash In Hand):*
• सुबह का गल्ला: ${formatCurrency(effectiveOpeningPaise)}
• नकद बिक्री (+): ${formatCurrency(summary.cashSalesPaise)}
• पुरानी उधारी वसूली (+): ${formatCurrency(summary.cashRecoveriesPaise)}
• सप्लायर को नकद दिया (-): ${formatCurrency(summary.cashSupplierPaidPaise)}
• आज के दुकान खर्चे (-): ${formatCurrency(summary.cashExpensesPaise)}
----------------------------------
*• गल्ले में होना चाहिए:* ${formatCurrency(effectiveExpectedCashPaise)}
*• भौतिक गिने गए नोट:* ${formatCurrency(physicalTotalPaise)}
*• स्थिति:* ${diffText}
${varianceReason ? `• अंतर कारण: ${varianceReason}\n` : ''}━━━━━━━━━━━━━━━━━━
*💳 ऑनलाइन व अन्य व्यापार:*
• UPI / ऑनलाइन आवक: ${formatCurrency(summary.upiSalesPaise + summary.upiRecoveriesPaise)}
• आज की नई उधारी: ${formatCurrency(summary.creditSalesPaise)}
• कुल आज की बिक्री: ${formatCurrency(summary.totalDaySalesPaise)}
━━━━━━━━━━━━━━━━━━
*नोटों का विवरण:*
${parseInt(n500, 10) > 0 ? `₹500x${n500} ` : ''}${parseInt(n200, 10) > 0 ? `₹200x${n200} ` : ''}${parseInt(n100, 10) > 0 ? `₹100x${n100} ` : ''}${parseInt(n50, 10) > 0 ? `₹50x${n50} ` : ''}${parseInt(n20, 10) > 0 ? `₹20x${n20} ` : ''}${parseInt(n10, 10) > 0 ? `₹10x${n10} ` : ''}${parseFloat(coinsRupees) > 0 ? `सिक्के: ₹${coinsRupees}` : ''}
━━━━━━━━━━━━━━━━━━
_दैनिक क्लोज़िंग Khata-Book ऐप द्वारा प्रमाणित_`;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
    } else {
      try {
        await Share.share({ message });
      } catch (e) {
        console.warn('Share error:', e);
      }
    }
  };

  const handleOpenHistory = async () => {
    if (!business) return;
    const list = await DataRepository.getDailyCashClosings(business.id);
    setClosingHistory(list.sort((a, b) => b.date.localeCompare(a.date)));
    setHistoryModalVisible(true);
  };

  return (
    <View style={styles.screen}>
      <Header
        title={language === 'hi' ? 'दैनिक गल्ला व क्लोज़िंग' : 'Daily Cash Closing'}
        subtitle={language === 'hi' ? 'गल्ला मिलान, खर्चा व दैनिक बैलेंस' : 'Cash Drawer Reconciliation'}
        showBack={true}
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity style={styles.historyBtn} onPress={handleOpenHistory}>
            <Ionicons name="time" size={16} color="#FFFFFF" />
            <Text style={styles.historyBtnText}>{language === 'hi' ? 'इतिहास' : 'History'}</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Date Selector Row */}
        <Card style={styles.dateSelectorCard}>
          <View style={styles.dateHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dateLabel}>{language === 'hi' ? 'क्लोज़िंग तारीख' : 'Reconciliation Date'}</Text>
              <Text style={styles.dateSub}>
                {targetDate === getTodayIST()
                  ? (language === 'hi' ? 'आज का हिसाब' : "Today's Account")
                  : (language === 'hi' ? 'पिछली तारीख का हिसाब' : 'Past Date Account')}
              </Text>
            </View>
            {summary.existingClosing?.isLocked && (
              <View style={styles.lockedBadge}>
                <Ionicons name="lock-closed" size={12} color="#166534" />
                <Text style={styles.lockedBadgeText}>{language === 'hi' ? 'क्लोज़िंग लॉक' : 'Locked'}</Text>
              </View>
            )}
          </View>

          <DatePickerField
            value={targetDate}
            onChange={(d) => setTargetDate(d)}
            containerStyle={{ marginBottom: 0 }}
          />
        </Card>

        {/* 1. Cash Reconciliation Overview Card */}
        <Card style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>
              💵 {language === 'hi' ? 'गल्ला लाइव हिसाब (Expected Cash)' : 'Cash Drawer Calculation'}
            </Text>
            <TouchableOpacity
              onPress={() => setIsEditingOpening(!isEditingOpening)}
              style={styles.editOpeningBtn}
            >
              <Ionicons name={isEditingOpening ? 'checkmark-circle' : 'create-outline'} size={14} color={Colors.primary} />
              <Text style={styles.editOpeningText}>
                {isEditingOpening
                  ? (language === 'hi' ? 'हो गया' : 'Done')
                  : (language === 'hi' ? 'ओपनिंग बदलें' : 'Edit Opening')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Opening Cash Input / View */}
          <View style={styles.cashFlowLine}>
            <View style={styles.flowIconCol}>
              <Ionicons name="sunny-outline" size={18} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.flowLabel}>{language === 'hi' ? 'सुबह का ओपनिंग गल्ला:' : 'Morning Opening Cash:'}</Text>
              {isEditingOpening ? (
                <View style={styles.openingInputWrap}>
                  <Text style={styles.currencyPrefix}>₹</Text>
                  <TextInput
                    style={styles.openingInput}
                    keyboardType="numeric"
                    value={customOpeningCash}
                    onChangeText={setCustomOpeningCash}
                    placeholder="0"
                  />
                </View>
              ) : (
                <Text style={styles.flowValBold}>{formatCurrency(effectiveOpeningPaise)}</Text>
              )}
            </View>
          </View>

          {/* Inflows */}
          <View style={styles.cashFlowLine}>
            <View style={styles.flowIconCol}>
              <Ionicons name="arrow-down-circle" size={18} color="#16A34A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.flowLabel}>{language === 'hi' ? 'नकद आवक (बिक्री + वसूली):' : 'Cash In (Sales + Udhaar):'}</Text>
              <Text style={[styles.flowValBold, { color: '#16A34A' }]}>
                +{formatCurrency(summary.cashSalesPaise + summary.cashRecoveriesPaise)}
              </Text>
              <Text style={styles.flowDetailSub}>
                नकद बिक्री: {formatCurrency(summary.cashSalesPaise)} • उधारी वसूली: {formatCurrency(summary.cashRecoveriesPaise)}
              </Text>
            </View>
          </View>

          {/* Outflows */}
          <View style={styles.cashFlowLine}>
            <View style={styles.flowIconCol}>
              <Ionicons name="arrow-up-circle" size={18} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.flowLabel}>{language === 'hi' ? 'नकद जावक (सप्लायर + खर्चे):' : 'Cash Out (Supplier + Expenses):'}</Text>
              <Text style={[styles.flowValBold, { color: '#DC2626' }]}>
                -{formatCurrency(summary.cashSupplierPaidPaise + summary.cashExpensesPaise)}
              </Text>
              <Text style={styles.flowDetailSub}>
                सप्लायर को दिया: {formatCurrency(summary.cashSupplierPaidPaise)} • दुकान खर्चे: {formatCurrency(summary.cashExpensesPaise)}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Expected Cash Box */}
          <View style={styles.expectedCashBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.expectedCashTitle}>
                {language === 'hi' ? 'गल्ले में होना चाहिए (Expected Cash):' : 'Expected in Drawer:'}
              </Text>
              <Text style={styles.expectedCashSub}>
                {language === 'hi' ? 'ओपनिंग + आवक - जावक' : 'Opening + Inflow - Outflow'}
              </Text>
            </View>
            <Text style={styles.expectedCashVal}>{formatCurrency(effectiveExpectedCashPaise)}</Text>
          </View>
        </Card>

        {/* 2. Indian Currency Denominations Counter */}
        <Card style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>
              🔢 {language === 'hi' ? 'गल्ला नोट कैलकुलेटर (Physical Count)' : 'Cash Counter'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setN500('');
                setN200('');
                setN100('');
                setN50('');
                setN20('');
                setN10('');
                setCoinsRupees('');
              }}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>{language === 'hi' ? 'रीसेट' : 'Clear'}</Text>
            </TouchableOpacity>
          </View>

          {/* Denomination Grid */}
          <View style={styles.denomTable}>
            {[
              { label: '₹500', noteVal: 500, val: n500, setVal: setN500, color: '#3B82F6', bg: '#EFF6FF' },
              { label: '₹200', noteVal: 200, val: n200, setVal: setN200, color: '#D97706', bg: '#FFFBEB' },
              { label: '₹100', noteVal: 100, val: n100, setVal: setN100, color: '#7C3AED', bg: '#F5F3FF' },
              { label: '₹50',  noteVal: 50,  val: n50,  setVal: setN50,  color: '#059669', bg: '#ECFDF5' },
              { label: '₹20',  noteVal: 20,  val: n20,  setVal: setN20,  color: '#EA580C', bg: '#FFF7ED' },
              { label: '₹10',  noteVal: 10,  val: n10,  setVal: setN10,  color: '#6B7280', bg: '#F3F4F6' },
            ].map((d) => {
              const count = parseInt(d.val, 10) || 0;
              const subtotal = count * d.noteVal;
              return (
                <View key={d.label} style={styles.denomRow}>
                  <View style={[styles.noteBadge, { backgroundColor: d.bg, borderColor: d.color }]}>
                    <Text style={[styles.noteBadgeText, { color: d.color }]}>{d.label}</Text>
                  </View>
                  <Text style={styles.multSymbol}>×</Text>
                  <TextInput
                    style={styles.denomInput}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#94A3B8"
                    value={d.val}
                    onChangeText={d.setVal}
                    selectTextOnFocus
                  />
                  <Text style={styles.equalSymbol}>=</Text>
                  <Text style={styles.denomSubtotalText}>₹{subtotal.toLocaleString('en-IN')}</Text>
                </View>
              );
            })}

            {/* Coins Row */}
            <View style={styles.denomRow}>
              <View style={[styles.noteBadge, { backgroundColor: '#F1F5F9', borderColor: '#94A3B8' }]}>
                <Text style={[styles.noteBadgeText, { color: '#475569' }]}>सिक्के</Text>
              </View>
              <Text style={styles.multSymbol}>₹</Text>
              <TextInput
                style={[styles.denomInput, { flex: 2 }]}
                keyboardType="numeric"
                placeholder="कुल सिक्के राशि (0)"
                placeholderTextColor="#94A3B8"
                value={coinsRupees}
                onChangeText={setCoinsRupees}
                selectTextOnFocus
              />
              <Text style={styles.equalSymbol}>=</Text>
              <Text style={styles.denomSubtotalText}>
                ₹{(parseFloat(coinsRupees) || 0).toLocaleString('en-IN')}
              </Text>
            </View>
          </View>

          {/* Counted Cash vs Expected Variance Banner */}
          <View style={styles.countSummaryBox}>
            <View style={styles.countLine}>
              <Text style={styles.countLineLabel}>{language === 'hi' ? 'गिने गए कुल नोट/कैश:' : 'Total Physical Cash:'}</Text>
              <Text style={styles.countLineVal}>{formatCurrency(physicalTotalPaise)}</Text>
            </View>

            {physicalTotalPaise > 0 && (
              <View
                style={[
                  styles.varianceAlertBox,
                  isMatch && styles.varianceMatch,
                  isShortage && styles.varianceShort,
                  isSurplus && styles.varianceSurplus,
                ]}
              >
                <Ionicons
                  name={isMatch ? 'checkmark-circle' : isShortage ? 'alert-circle' : 'trending-up'}
                  size={20}
                  color={isMatch ? '#15803D' : isShortage ? '#DC2626' : '#D97706'}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.varianceAlertTitle,
                      { color: isMatch ? '#15803D' : isShortage ? '#DC2626' : '#D97706' },
                    ]}
                  >
                    {isMatch
                      ? (language === 'hi' ? '✓ गल्ला शत-प्रतिशत मिल गया (Matched)' : 'Cash Drawer Matched!')
                      : isShortage
                      ? (language === 'hi'
                          ? `⚠️ गल्ले में ${formatCurrency(Math.abs(variancePaise))} की कमी है (Shortage)`
                          : `Cash Shortage of ${formatCurrency(Math.abs(variancePaise))}`)
                      : (language === 'hi'
                          ? `⚠️ गल्ले में ${formatCurrency(variancePaise)} अधिक है (Surplus)`
                          : `Cash Surplus of ${formatCurrency(variancePaise)}`)}
                  </Text>
                </View>
              </View>
            )}

            {(isShortage || isSurplus) && (
              <View style={{ marginTop: 8 }}>
                <Input
                  label={language === 'hi' ? 'अंतर का कारण (Optional):' : 'Variance Reason:'}
                  placeholder="उदा. छुट्टे ₹20 नहीं मिले / राउंड ऑफ अंतर..."
                  value={varianceReason}
                  onChangeText={setVarianceReason}
                  containerStyle={{ marginBottom: 0 }}
                />
              </View>
            )}
          </View>
        </Card>

        {/* 3. Daily Petty Expenses Section */}
        <Card style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={styles.cardTitle}>
                ☕ {language === 'hi' ? 'दुकान के दैनिक खर्चे (Expenses)' : 'Daily Expenses'}
              </Text>
              <Text style={styles.cardSub}>
                कुल आज का खर्च: <Text style={{ fontWeight: '800', color: '#DC2626' }}>{formatCurrency(summary.cashExpensesPaise + summary.upiExpensesPaise)}</Text>
              </Text>
            </View>
            <TouchableOpacity
              style={styles.addExpenseBtn}
              onPress={() => {
                setExpAmount('');
                setExpTitle('');
                setExpPaidTo('');
                setExpMethod('CASH');
                setExpenseModalVisible(true);
              }}
            >
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.addExpenseBtnText}>{language === 'hi' ? '+ खर्चा जोड़ें' : '+ Add Expense'}</Text>
            </TouchableOpacity>
          </View>

          {expenses.length === 0 ? (
            <View style={styles.emptyExpenseBox}>
              <Ionicons name="receipt-outline" size={28} color="#94A3B8" />
              <Text style={styles.emptyExpenseText}>
                {language === 'hi'
                  ? 'आज का कोई दुकान खर्चा दर्ज नहीं है।'
                  : 'No shop expenses recorded today.'}
              </Text>
            </View>
          ) : (
            expenses.map((e) => {
              const cat = EXPENSE_CATEGORIES.find((c) => c.key === e.category) || EXPENSE_CATEGORIES[5];
              return (
                <View key={e.id} style={styles.expenseItemRow}>
                  <View style={[styles.expIconBadge, { backgroundColor: cat.color + '15' }]}>
                    <Ionicons name={cat.icon} size={18} color={cat.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.expItemTitle}>{e.title}</Text>
                    <Text style={styles.expItemSub}>
                      {cat.labelHi} • {e.paymentMethod === 'CASH' ? '💵 नकद' : '💳 UPI'}
                      {e.paidTo ? ` • किसको: ${e.paidTo}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.expItemAmount}>{formatCurrency(e.amountPaise)}</Text>
                  <TouchableOpacity
                    onPress={() => handleDeleteExpense(e.id)}
                    style={styles.delExpBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </Card>

        {/* 4. Non-Cash & Total Turnover Summary */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>
            📊 {language === 'hi' ? 'आज का सम्पूर्ण व्यापार (Day Totals)' : 'Total Day Turnover'}
          </Text>

          <View style={styles.metricsGrid}>
            <View style={styles.metricCell}>
              <Text style={styles.metricCellLabel}>{language === 'hi' ? 'कुल बिक्री (Turnover):' : 'Total Sales:'}</Text>
              <Text style={[styles.metricCellVal, { color: Colors.primary }]}>
                {formatCurrency(summary.totalDaySalesPaise)}
              </Text>
              <Text style={styles.metricCellSub}>
                नकद: {formatCurrency(summary.cashSalesPaise)} • UPI: {formatCurrency(summary.upiSalesPaise)} • उधारी: {formatCurrency(summary.creditSalesPaise)}
              </Text>
            </View>

            <View style={styles.metricCell}>
              <Text style={styles.metricCellLabel}>{language === 'hi' ? 'आज की नई उधारी:' : 'Credit Given:'}</Text>
              <Text style={[styles.metricCellVal, { color: '#B45309' }]}>
                {formatCurrency(summary.creditSalesPaise)}
              </Text>
              <Text style={styles.metricCellSub}>{language === 'hi' ? 'किसानों के खाते में बाकी' : 'Added to Khata'}</Text>
            </View>

            <View style={styles.metricCell}>
              <Text style={styles.metricCellLabel}>{language === 'hi' ? 'ऑनलाइन / UPI आवक:' : 'Total UPI/Online:'}</Text>
              <Text style={[styles.metricCellVal, { color: '#7C3AED' }]}>
                {formatCurrency(summary.upiSalesPaise + summary.upiRecoveriesPaise)}
              </Text>
              <Text style={styles.metricCellSub}>
                {language === 'hi'
                  ? `बिक्री: ${formatCurrency(summary.upiSalesPaise)} • वसूली: ${formatCurrency(summary.upiRecoveriesPaise)}`
                  : `Sale: ${formatCurrency(summary.upiSalesPaise)} • Recovery: ${formatCurrency(summary.upiRecoveriesPaise)}`}
              </Text>
            </View>

            <View style={styles.metricCell}>
              <Text style={styles.metricCellLabel}>{language === 'hi' ? 'कुल दिन की वसूली:' : 'Total Collections:'}</Text>
              <Text style={[styles.metricCellVal, { color: '#166534' }]}>
                {formatCurrency(summary.totalDayCollectionsPaise)}
              </Text>
              <Text style={styles.metricCellSub}>
                {language === 'hi'
                  ? `नकद: ${formatCurrency(summary.cashSalesPaise + summary.cashRecoveriesPaise)} • UPI: ${formatCurrency(summary.upiSalesPaise + summary.upiRecoveriesPaise)}`
                  : `Cash: ${formatCurrency(summary.cashSalesPaise + summary.cashRecoveriesPaise)} • UPI: ${formatCurrency(summary.upiSalesPaise + summary.upiRecoveriesPaise)}`}
              </Text>
            </View>
          </View>
        </Card>

        {/* 5. Closing Actions */}
        <View style={styles.actionSection}>
          <TouchableOpacity
            style={styles.whatsappShareBtn}
            onPress={handleShareWhatsApp}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
            <Text style={styles.whatsappShareBtnText}>
              {language === 'hi' ? 'WhatsApp पर क्लोज़िंग रिपोर्ट भेजें' : 'Share Closing via WhatsApp'}
            </Text>
          </TouchableOpacity>

          <Button
            title={
              saving
                ? (language === 'hi' ? 'क्लोज़िंग लॉक हो रही है...' : 'Locking Closing...')
                : summary.existingClosing?.isLocked
                ? (language === 'hi' ? 'दिन का हिसाब अपडेट करें (Update)' : 'Update Day Closing')
                : (language === 'hi' ? '🔒 दिन समाप्त करें व गल्ला लॉक करें' : 'Lock & Save Day Closing')
            }
            onPress={handleLockClosing}
            loading={saving}
            style={{ backgroundColor: summary.existingClosing?.isLocked ? '#059669' : Colors.primary }}
          />
        </View>
      </ScrollView>

      {/* Add Expense Modal */}
      <Modal visible={expenseModalVisible} transparent animationType="slide" onRequestClose={() => setExpenseModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{language === 'hi' ? 'दुकान खर्चा जोड़ें' : 'Add Shop Expense'}</Text>
              <TouchableOpacity onPress={() => setExpenseModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Category Chips */}
            <Text style={styles.fieldSubLabel}>{language === 'hi' ? 'खर्च की श्रेणी (Category):' : 'Category:'}</Text>
            <View style={styles.categoryChipsGrid}>
              {EXPENSE_CATEGORIES.map((c) => {
                const isSel = expCategory === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.categoryChip, isSel && { backgroundColor: c.color, borderColor: c.color }]}
                    onPress={() => setExpCategory(c.key)}
                  >
                    <Ionicons name={c.icon} size={14} color={isSel ? '#FFFFFF' : c.color} />
                    <Text style={[styles.categoryChipText, isSel && { color: '#FFFFFF' }]}>
                      {c.labelHi}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Input
              label={language === 'hi' ? 'खर्च राशि (₹) *' : 'Amount (₹) *'}
              placeholder="0.00"
              keyboardType="numeric"
              value={expAmount}
              onChangeText={setExpAmount}
              autoFocus
            />

            <Input
              label={language === 'hi' ? 'खर्च विवरण / नाम (Optional)' : 'Description (Optional)'}
              placeholder="उदा. नाश्ता, मजदूर रमेश, बिजली बिल..."
              value={expTitle}
              onChangeText={setExpTitle}
            />

            {/* Payment Method Toggle */}
            <Text style={styles.fieldSubLabel}>{language === 'hi' ? 'भुगतान का माध्यम:' : 'Paid Via:'}</Text>
            <View style={styles.payMethodToggleRow}>
              <TouchableOpacity
                style={[styles.payMethodBtn, expMethod === 'CASH' && styles.payMethodBtnActive]}
                onPress={() => setExpMethod('CASH')}
              >
                <Ionicons name="cash" size={16} color={expMethod === 'CASH' ? '#FFFFFF' : Colors.textPrimary} />
                <Text style={[styles.payMethodText, expMethod === 'CASH' && styles.payMethodTextActive]}>
                  {language === 'hi' ? '💵 गल्ले से नकद' : 'Cash'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.payMethodBtn, expMethod === 'UPI' && styles.payMethodBtnActive]}
                onPress={() => setExpMethod('UPI')}
              >
                <Ionicons name="phone-portrait" size={16} color={expMethod === 'UPI' ? '#FFFFFF' : Colors.textPrimary} />
                <Text style={[styles.payMethodText, expMethod === 'UPI' && styles.payMethodTextActive]}>
                  {language === 'hi' ? '💳 ऑनलाइन / UPI' : 'UPI / Online'}
                </Text>
              </TouchableOpacity>
            </View>

            <Input
              label={language === 'hi' ? 'किसको दिया (Paid To / Person):' : 'Paid To:'}
              placeholder="उदा. चाय की दुकान, ड्राइवर..."
              value={expPaidTo}
              onChangeText={setExpPaidTo}
            />

            <View style={styles.modalActionsRow}>
              <Button
                title={language === 'hi' ? 'रद्द करें' : 'Cancel'}
                variant="outline"
                onPress={() => setExpenseModalVisible(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title={savingExpense ? '...' : (language === 'hi' ? 'खर्चा सुरक्षित करें' : 'Save Expense')}
                onPress={handleSaveExpense}
                loading={savingExpense}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Closing History Modal */}
      <Modal visible={historyModalVisible} transparent animationType="slide" onRequestClose={() => setHistoryModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{language === 'hi' ? 'गल्ला क्लोज़िंग इतिहास' : 'Closing History'}</Text>
              <TouchableOpacity onPress={() => setHistoryModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {closingHistory.length === 0 ? (
                <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
                  <Text style={{ color: Colors.textSecondary }}>
                    {language === 'hi' ? 'कोई पुराना क्लोज़िंग रिकॉर्ड नहीं मिला।' : 'No closing records found.'}
                  </Text>
                </View>
              ) : (
                closingHistory.map((c) => {
                  const isDiff = c.variancePaise !== 0;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.historyItemCard}
                      onPress={() => {
                        setTargetDate(c.date);
                        setHistoryModalVisible(false);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyDateTitle}>📅 {formatUpperDate(c.date)}</Text>
                        <Text style={styles.historyDateSub}>
                          अपेक्षित: {formatCurrency(c.expectedCashPaise)} • गिने गए: {formatCurrency(c.physicalCashPaise)}
                        </Text>
                        {isDiff ? (
                          <Text style={[styles.historyVarianceText, { color: c.variancePaise < 0 ? '#DC2626' : '#D97706' }]}>
                            {c.variancePaise < 0 ? '⚠️ कमी: ' : '⚠️ अधिक: '}
                            {formatCurrency(Math.abs(c.variancePaise))}
                            {c.varianceReason ? ` (${c.varianceReason})` : ''}
                          </Text>
                        ) : (
                          <Text style={styles.historyMatchText}>✓ शत-प्रतिशत मिलान</Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
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
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: 40,
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  historyBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  dateSelectorCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  dateHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  dateSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  lockedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
  },
  card: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  cardSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  editOpeningBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  editOpeningText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  cashFlowLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  flowIconCol: {
    width: 28,
    alignItems: 'center',
    marginTop: 2,
  },
  flowLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  flowValBold: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 1,
  },
  flowDetailSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  openingInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 8,
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    maxWidth: 160,
  },
  currencyPrefix: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginRight: 4,
  },
  openingInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
    paddingVertical: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: Spacing.sm,
  },
  expectedCashBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFF6FF',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  expectedCashTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E40AF',
  },
  expectedCashSub: {
    fontSize: 11,
    color: '#60A5FA',
    marginTop: 2,
  },
  expectedCashVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1E3A8A',
  },
  clearBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  clearBtnText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  denomTable: {
    gap: 6,
    marginVertical: Spacing.xs,
  },
  denomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noteBadge: {
    width: 60,
    alignItems: 'center',
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  noteBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  multSymbol: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  denomInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: BorderRadius.sm,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  equalSymbol: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  denomSubtotalText: {
    width: 90,
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'right',
  },
  countSummaryBox: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  countLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  countLineLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  countLineVal: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.primary,
  },
  varianceAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: 4,
  },
  varianceMatch: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  varianceShort: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  varianceSurplus: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  varianceAlertTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  addExpenseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DC2626',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  addExpenseBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyExpenseBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    gap: 6,
  },
  emptyExpenseText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  expenseItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  expIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  expItemSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  expItemAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
  },
  delExpBtn: {
    padding: 6,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: Spacing.xs,
  },
  metricCell: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing.sm,
  },
  metricCellLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  metricCellVal: {
    fontSize: 14,
    fontWeight: '800',
    marginVertical: 2,
  },
  metricCellSub: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  actionSection: {
    gap: 10,
    marginTop: Spacing.xs,
  },
  whatsappShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16A34A',
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
  },
  whatsappShareBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    width: '100%',
    maxWidth: 480,
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
  fieldSubLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  categoryChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  payMethodToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  payMethodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  payMethodBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  payMethodText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  payMethodTextActive: {
    color: '#FFFFFF',
  },
  modalActionsRow: {
    flexDirection: 'row',
    marginTop: Spacing.sm,
  },
  historyItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  historyDateTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  historyDateSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  historyVarianceText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  historyMatchText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
    marginTop: 2,
  },
});
