import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { DataRepository } from '../../services/db';
import { Supplier, SupplierPayment, PaymentMethod } from '../../types';
import { formatCurrency, toPaise, toRupees } from '../../utils/money';
import { showAlert } from '../../utils/dialog';

export const SupplierListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { business, language } = useApp();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Add/Edit Supplier Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Pay Supplier Modal
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [paySupplier, setPaySupplier] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('UPI');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [paySaving, setPaySaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!business) return;
    try {
      const list = await DataRepository.getSuppliers(business.id);
      setSuppliers(list);
    } catch (err) {
      console.warn('Error loading suppliers:', err);
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

  const openAddModal = () => {
    setEditingSupplier(null);
    setName('');
    setContactPerson('');
    setPhone('');
    setAddress('');
    setGstin('');
    setNotes('');
    setModalVisible(true);
  };

  const openEditModal = (sup: Supplier) => {
    setEditingSupplier(sup);
    setName(sup.name);
    setContactPerson(sup.contactPerson || '');
    setPhone(sup.phone);
    setAddress(sup.address || '');
    setGstin(sup.gstin || '');
    setNotes(sup.notes || '');
    setModalVisible(true);
  };

  const handleSaveSupplier = async () => {
    if (!business) return;
    if (!name.trim()) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'कृपया सप्लायर / फर्म का नाम दर्ज करें।' : 'Please enter supplier name.', undefined, 'danger');
      return;
    }
    if (!phone.trim()) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'कृपया मोबाइल नंबर दर्ज करें।' : 'Please enter phone number.', undefined, 'danger');
      return;
    }

    setSaving(true);
    try {
      const supId = editingSupplier ? editingSupplier.id : `sup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const supplierToSave: Supplier = {
        id: supId,
        businessId: business.id,
        name: name.trim(),
        contactPerson: contactPerson.trim() || undefined,
        phone: phone.trim(),
        address: address.trim() || undefined,
        gstin: gstin.trim() || undefined,
        notes: notes.trim() || undefined,
        totalPurchasePaise: editingSupplier ? editingSupplier.totalPurchasePaise : 0,
        totalPaidPaise: editingSupplier ? editingSupplier.totalPaidPaise : 0,
        currentOutstandingPaise: editingSupplier ? editingSupplier.currentOutstandingPaise : 0,
        status: 'ACTIVE',
        createdAt: editingSupplier ? editingSupplier.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = await DataRepository.saveSupplier(supplierToSave);
      if (res.success) {
        setModalVisible(false);
        loadData();
        showAlert(
          language === 'hi' ? 'सफल' : 'Success',
          language === 'hi'
            ? editingSupplier
              ? 'सप्लायर विवरण सुरक्षित हुआ।'
              : 'नया सप्लायर सफलतापूर्वक जुड़ा।'
            : 'Supplier saved successfully.',
          undefined,
          'success'
        );
      } else {
        showAlert(language === 'hi' ? 'त्रुटि' : 'Error', res.error || 'Failed to save', undefined, 'danger');
      }
    } catch (err: any) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', err.message, undefined, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const openPayModal = (sup: Supplier) => {
    setPaySupplier(sup);
    setPayAmount(toRupees(sup.currentOutstandingPaise || 0).toString());
    setPayMethod('UPI');
    setPayRef('');
    setPayNotes('');
    setPayModalVisible(true);
  };

  const handleSavePayment = async () => {
    if (!business || !paySupplier) return;
    const num = parseFloat(payAmount);
    if (isNaN(num) || num <= 0) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'कृपया सही भुगतान राशि दर्ज करें।' : 'Please enter valid payment amount.', undefined, 'danger');
      return;
    }

    setPaySaving(true);
    try {
      const payment: SupplierPayment = {
        id: `sup_pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        businessId: business.id,
        supplierId: paySupplier.id,
        supplierName: paySupplier.name,
        amountPaise: toPaise(num),
        paymentMethod: payMethod,
        referenceNo: payRef.trim() || undefined,
        date: new Date().toISOString().split('T')[0],
        notes: payNotes.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      const res = await DataRepository.saveSupplierPayment(payment);
      if (res.success) {
        setPayModalVisible(false);
        loadData();
        showAlert(
          language === 'hi' ? 'सफल' : 'Success',
          language === 'hi' ? 'सप्लायर को भुगतान सुरक्षित हुआ।' : 'Supplier payment recorded successfully.',
          undefined,
          'success'
        );
      } else {
        showAlert(language === 'hi' ? 'त्रुटि' : 'Error', res.error || 'Failed to save payment', undefined, 'danger');
      }
    } catch (err: any) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', err.message, undefined, 'danger');
    } finally {
      setPaySaving(false);
    }
  };

  const filteredSuppliers = suppliers.filter((s) => {
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.phone.includes(q) || (s.contactPerson && s.contactPerson.toLowerCase().includes(q));
  });

  const totalOutstandingPaise = suppliers.reduce((sum, s) => sum + (s.currentOutstandingPaise || 0), 0);

  return (
    <View style={styles.screen}>
      <Header
        title={language === 'hi' ? 'सप्लायर खाता (डीलर)' : 'Suppliers (Dealers)'}
        subtitle={language === 'hi' ? 'डीलर खरीद व बकाया हिसाब' : 'Dealer Purchases & Dues'}
        showBack={true}
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>{language === 'hi' ? 'नया सप्लायर' : 'Add Supplier'}</Text>
          </TouchableOpacity>
        }
      />

      {/* KPI Cards */}
      <View style={styles.kpiRow}>
        <Card style={[styles.kpiCard, { borderLeftColor: Colors.primary }]}>
          <Text style={styles.kpiLabel}>{language === 'hi' ? 'कुल सप्लायर्स' : 'Total Suppliers'}</Text>
          <Text style={styles.kpiValue}>{suppliers.length}</Text>
        </Card>

        <Card style={[styles.kpiCard, { borderLeftColor: '#DC2626' }]}>
          <Text style={styles.kpiLabel}>{language === 'hi' ? 'कुल बाकी (देना है)' : 'Total Due to Pay'}</Text>
          <Text style={[styles.kpiValue, { color: '#DC2626' }]}>{formatCurrency(totalOutstandingPaise)}</Text>
        </Card>
      </View>

      {/* Search Input */}
      <View style={styles.searchBar}>
        <Input
          placeholder={language === 'hi' ? 'सप्लायर या फोन नंबर खोजें...' : 'Search supplier or phone...'}
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

      {/* Suppliers List */}
      <FlatList
        data={filteredSuppliers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {language === 'hi' ? 'कोई सप्लायर नहीं मिला' : 'No Suppliers Found'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {language === 'hi'
                  ? 'ऊपर "+ नया सप्लायर" बटन दबाकर डीलर जोड़ें।'
                  : 'Tap "+ Add Supplier" to register your first supplier.'}
              </Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => {
          const hasDue = (item.currentOutstandingPaise || 0) > 0;
          return (
            <Card style={styles.supplierCard}>
              <View style={styles.supHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.supName}>{item.name}</Text>
                  {item.contactPerson ? (
                    <Text style={styles.contactPerson}>
                      👤 {item.contactPerson} ({item.phone})
                    </Text>
                  ) : (
                    <Text style={styles.contactPerson}>📞 {item.phone}</Text>
                  )}
                  {item.address ? <Text style={styles.supAddress}>📍 {item.address}</Text> : null}
                </View>

                <TouchableOpacity style={styles.editIconBtn} onPress={() => openEditModal(item)}>
                  <Ionicons name="pencil" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.divider} />

              <View style={styles.supMetricsRow}>
                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>{language === 'hi' ? 'कुल खरीद' : 'Total Purchase'}</Text>
                  <Text style={styles.metricVal}>{formatCurrency(item.totalPurchasePaise || 0)}</Text>
                </View>

                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>{language === 'hi' ? 'कुल भुगतान' : 'Total Paid'}</Text>
                  <Text style={[styles.metricVal, { color: '#166534' }]}>{formatCurrency(item.totalPaidPaise || 0)}</Text>
                </View>

                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>{language === 'hi' ? 'बाकी उधार' : 'Balance Due'}</Text>
                  <Text style={[styles.metricVal, { color: hasDue ? '#DC2626' : '#166534', fontWeight: '800' }]}>
                    {formatCurrency(item.currentOutstandingPaise || 0)}
                  </Text>
                </View>
              </View>

              <View style={styles.supActionRow}>
                <TouchableOpacity
                  style={styles.payBtn}
                  onPress={() => openPayModal(item)}
                >
                  <Ionicons name="cash-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.payBtnText}>{language === 'hi' ? 'भुगतान करें' : 'Pay'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.viewPurchasesBtn}
                  onPress={() => navigation.navigate('PurchaseList', { supplierId: item.id, supplierName: item.name })}
                >
                  <Ionicons name="receipt-outline" size={16} color={Colors.primary} />
                  <Text style={styles.viewPurchasesBtnText}>{language === 'hi' ? 'खरीद बिल' : 'Bills'}</Text>
                </TouchableOpacity>
              </View>
            </Card>
          );
        }}
      />

      {/* Add / Edit Supplier Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingSupplier
                  ? language === 'hi' ? 'सप्लायर विवरण बदलें' : 'Edit Supplier'
                  : language === 'hi' ? 'नया सप्लायर / डीलर जोड़ें' : 'Add Supplier'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Input
                label={language === 'hi' ? 'सप्लायर / फर्म का नाम *' : 'Supplier / Firm Name *'}
                placeholder="उदा. श्रीराम कृषि केंद्र, बायर डिस्ट्रीब्यूटर"
                value={name}
                onChangeText={setName}
              />

              <Input
                label={language === 'hi' ? 'संपर्क व्यक्ति (Contact Person)' : 'Contact Person'}
                placeholder="उदा. रमेश कुमार"
                value={contactPerson}
                onChangeText={setContactPerson}
              />

              <Input
                label={language === 'hi' ? 'मोबाइल नंबर *' : 'Phone Number *'}
                placeholder="उदा. 9876543210"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />

              <Input
                label={language === 'hi' ? 'पता / शहर (Address)' : 'Address / City'}
                placeholder="उदा. मंडी रोड, इटावा"
                value={address}
                onChangeText={setAddress}
              />

              <Input
                label={language === 'hi' ? 'GSTIN नंबर (Optional)' : 'GSTIN (Optional)'}
                placeholder="उदा. 09AAAAA0000A1Z5"
                value={gstin}
                onChangeText={setGstin}
                autoCapitalize="characters"
              />

              <Input
                label={language === 'hi' ? 'नोट्स / टिप्पणी (Notes)' : 'Notes'}
                placeholder="कोई अन्य विवरण..."
                value={notes}
                onChangeText={setNotes}
              />

              <View style={styles.modalActions}>
                <Button
                  title={language === 'hi' ? 'रद्द करें' : 'Cancel'}
                  variant="outline"
                  onPress={() => setModalVisible(false)}
                  style={{ flex: 1, marginRight: 8 }}
                />
                <Button
                  title={language === 'hi' ? 'सुरक्षित करें' : 'Save'}
                  onPress={handleSaveSupplier}
                  loading={saving}
                  style={{ flex: 1 }}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Pay Supplier Modal */}
      <Modal visible={payModalVisible} transparent animationType="slide" onRequestClose={() => setPayModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {language === 'hi' ? 'सप्लायर को भुगतान' : 'Pay Supplier'}
              </Text>
              <TouchableOpacity onPress={() => setPayModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {paySupplier && (
              <View style={styles.payTargetCard}>
                <Text style={styles.payTargetName}>{paySupplier.name}</Text>
                <Text style={styles.payTargetDue}>
                  {language === 'hi' ? 'कुल बकाया:' : 'Current Due:'}{' '}
                  <Text style={{ color: '#DC2626', fontWeight: '800' }}>
                    {formatCurrency(paySupplier.currentOutstandingPaise || 0)}
                  </Text>
                </Text>
              </View>
            )}

            <Input
              label={language === 'hi' ? 'भुगतान राशि (₹) *' : 'Payment Amount (₹) *'}
              placeholder="0.00"
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="decimal-pad"
              prefix="₹"
            />

            <Text style={styles.fieldLabel}>{language === 'hi' ? 'भुगतान माध्यम' : 'Payment Method'}</Text>
            <View style={styles.methodRow}>
              {(['UPI', 'CASH', 'BANK_TRANSFER', 'CHEQUE'] as PaymentMethod[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.methodChip, payMethod === m && styles.methodChipActive]}
                  onPress={() => setPayMethod(m)}
                >
                  <Text style={[styles.methodChipText, payMethod === m && styles.methodChipTextActive]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Input
              label={language === 'hi' ? 'रेफरेंस / चेक नंबर (Optional)' : 'Reference / Cheque No.'}
              placeholder="उदा. UPI-99881122"
              value={payRef}
              onChangeText={setPayRef}
            />

            <View style={styles.modalActions}>
              <Button
                title={language === 'hi' ? 'रद्द करें' : 'Cancel'}
                variant="outline"
                onPress={() => setPayModalVisible(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title={language === 'hi' ? 'भुगतान दर्ज करें' : 'Record Payment'}
                onPress={handleSavePayment}
                loading={paySaving}
                style={{ flex: 1 }}
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
  supplierCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  supHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  supName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  contactPerson: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  supAddress: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  editIconBtn: {
    padding: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: BorderRadius.sm,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: Spacing.sm,
  },
  supMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricCol: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  metricVal: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  supActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  payBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#166534',
    paddingVertical: 7,
    borderRadius: BorderRadius.md,
    gap: 4,
  },
  payBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  viewPurchasesBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    paddingVertical: 7,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    gap: 4,
  },
  viewPurchasesBtnText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
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
  payTargetCard: {
    backgroundColor: '#F8FAFC',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  payTargetName: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  payTargetDue: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: Spacing.sm,
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
});
