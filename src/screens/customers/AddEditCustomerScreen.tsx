import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { t } from '../../i18n';
import { toPaise, toRupees } from '../../utils/money';
import { DataRepository } from '../../services/db';
import { Customer, Village } from '../../types';
import { Ionicons } from '@expo/vector-icons';
import { confirmAction } from '../../utils/dialog';

export const AddEditCustomerScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { business, language, refreshAllData, isAuthenticated, guardAction } = useApp();

  const existingCustomer: Customer | undefined = route.params?.customer;
  const isEditing = !!existingCustomer;

  const [name, setName] = useState(existingCustomer?.name || '');
  const [mobile, setMobile] = useState(existingCustomer?.mobile || '');
  const [address, setAddress] = useState(existingCustomer?.address || '');
  const [openingBalance, setOpeningBalance] = useState(
    existingCustomer ? (toRupees(existingCustomer.openingBalancePaise) || '').toString() : ''
  );
  const [notes, setNotes] = useState(existingCustomer?.notes || '');
  const [selectedVillage, setSelectedVillage] = useState<Village | null>(null);
  const [villages, setVillages] = useState<Village[]>([]);
  const [villageModalVisible, setVillageModalVisible] = useState(false);
  const [newVillageName, setNewVillageName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadVillages = async () => {
      if (!business) return;
      const vList = await DataRepository.getVillages(business.id);
      setVillages(vList);

      if (existingCustomer?.villageId) {
        const found = vList.find((v) => v.id === existingCustomer.villageId);
        if (found) setSelectedVillage(found);
      } else if (vList.length > 0 && !selectedVillage) {
        setSelectedVillage(vList[0]);
      }
    };
    loadVillages();
  }, [business, existingCustomer]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) {
      errs.name = t('enterCustomerNameError', language);
    }
    if (mobile.trim() && !/^[0-9]{10}$/.test(mobile.trim())) {
      errs.mobile = t('enterValidMobileError', language);
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleQuickAddVillage = async () => {
    if (!isAuthenticated) {
      guardAction(() => handleQuickAddVillage());
      return;
    }
    if (!newVillageName.trim() || !business) return;
    const v: Village = {
      id: `vil_${Date.now()}`,
      businessId: business.id,
      name: newVillageName.trim(),
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const res = await DataRepository.saveVillage(v);
    if (!res.success) {
      Alert.alert(t('error', language), res.error || t('duplicateVillageWarning', language));
      return;
    }
    const updated = await DataRepository.getVillages(business.id);
    setVillages(updated);
    setSelectedVillage(v);
    setNewVillageName('');
    setVillageModalVisible(false);
  };

  const handleDeleteCustomer = async () => {
    if (!isAuthenticated) {
      guardAction(() => handleDeleteCustomer());
      return;
    }
    if (!business || !existingCustomer) return;

    // Prevent deletion if transactions exist
    setLoading(true);
    const txs = await DataRepository.getTransactions(business.id, existingCustomer.id);
    setLoading(false);

    if (txs.length > 0) {
      const msg =
        language === 'hi'
          ? `"${existingCustomer.name}" के खाते में ${txs.length} लेन-देन दर्ज हैं।\n\nखाता-बही की सुरक्षा के लिए, जब तक लेन-देन मौजूद हैं ग्राहक को हटाया नहीं जा सकता।\n\nकृपया पहले खाता-बही से सभी लेन-देन हटाएं।`
          : `"${existingCustomer.name}" has ${txs.length} recorded transaction(s).\n\nTo preserve accounting accuracy, customers with transaction history cannot be deleted.\n\nPlease delete all transactions from the customer ledger first.`;
      Alert.alert(t('cannotDeleteCustomerTitle', language), msg);
      return;
    }

    const confirmMsg =
      language === 'hi'
        ? `क्या आप सचमुच ग्राहक "${existingCustomer.name}" को हटाना चाहते हैं?`
        : `Are you sure you want to delete customer "${existingCustomer.name}"?`;

    confirmAction(
      t('deleteCustomer', language),
      confirmMsg,
      async () => {
        setLoading(true);
        const res = await DataRepository.deleteCustomer(business.id, existingCustomer.id);
        await refreshAllData();
        setLoading(false);
        if (res.success) {
          const successMsg =
            language === 'hi'
              ? `ग्राहक "${existingCustomer.name}" सफलतापूर्वक हटा दिया गया।`
              : `Customer "${existingCustomer.name}" deleted successfully.`;
          if (Platform.OS === 'web') {
            window.alert(successMsg);
            navigation.navigate('MainTabs', { screen: 'CustomersTab' });
          } else {
            Alert.alert(t('success', language), successMsg, [
              {
                text: t('ok', language),
                onPress: () => {
                  navigation.navigate('MainTabs', { screen: 'CustomersTab' });
                },
              },
            ]);
          }
        } else if (res.error === 'HAS_TRANSACTIONS') {
          if (Platform.OS === 'web') {
            window.alert(`${t('cannotDeleteCustomerTitle', language)}\n\n${t('cannotDeleteCustomerHasTx', language)}`);
          } else {
            Alert.alert(
              t('cannotDeleteCustomerTitle', language),
              t('cannotDeleteCustomerHasTx', language)
            );
          }
        } else {
          const errMsg = res.error || 'Failed to delete customer';
          if (Platform.OS === 'web') {
            window.alert(errMsg);
          } else {
            Alert.alert(t('error', language), errMsg);
          }
        }
      },
      t('delete', language),
      t('cancel', language)
    );
  };

  const handleSave = async () => {
    if (!isAuthenticated) {
      guardAction(() => handleSave());
      return;
    }
    if (!validate() || !business) return;

    setLoading(true);
    try {
      const opBalPaise = toPaise(openingBalance || 0);
      const prevOpBalPaise = existingCustomer?.openingBalancePaise || 0;
      const opBalDiff = opBalPaise - prevOpBalPaise;

      const customerToSave: Customer = {
        id: existingCustomer?.id || `cust_${Date.now()}`,
        businessId: business.id,
        name: name.trim(),
        mobile: mobile.trim(),
        villageId: selectedVillage?.id || '',
        villageName: selectedVillage?.name || '',
        address: address.trim(),
        openingBalancePaise: opBalPaise,
        currentBalancePaise: existingCustomer
          ? (existingCustomer.currentBalancePaise || 0) + opBalDiff
          : opBalPaise,
        totalCreditPaise: existingCustomer?.totalCreditPaise || 0,
        totalPaymentPaise: existingCustomer?.totalPaymentPaise || 0,
        transactionCount: existingCustomer?.transactionCount || 0,
        notes: notes.trim(),
        status: 'ACTIVE',
        createdAt: existingCustomer?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await DataRepository.saveCustomer(customerToSave);
      await refreshAllData();
      setLoading(false);

      if (result.success) {
        const onDone = () => {
          if (isEditing) {
            navigation.goBack();
          } else {
            navigation.replace('CustomerLedger', { customer: result.customer });
          }
        };

        if (Platform.OS === 'web') {
          window.alert(t('customerSavedSuccess', language));
          onDone();
        } else {
          Alert.alert(
            t('success', language),
            t('customerSavedSuccess', language),
            [
              {
                text: t('ok', language),
                onPress: onDone,
              },
            ]
          );
        }
      }
    } catch (err: any) {
      setLoading(false);
      Alert.alert(t('error', language), err.message || 'Error saving customer');
    }
  };

  return (
    <View style={styles.screen}>
      <Header
        title={isEditing ? t('editCustomer', language) : t('addCustomer', language)}
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          isEditing ? (
            <TouchableOpacity onPress={handleDeleteCustomer} style={styles.headerDeleteBtn}>
              <Ionicons name="trash-outline" size={20} color={Colors.textInverse} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card>
          {/* Customer Name */}
          <Input
            label={`${t('customerName', language)} *`}
            placeholder={language === 'hi' ? 'जैसे: शिवनन्दन' : 'e.g. Shivnandan'}
            value={name}
            onChangeText={setName}
            error={errors.name}
            autoFocus={!isEditing}
          />

          {/* Mobile Number */}
          <Input
            label={t('mobileNumber', language)}
            placeholder={language === 'hi' ? '10 अंकों का मोबाइल नंबर' : '10 digit mobile number'}
            value={mobile}
            onChangeText={setMobile}
            keyboardType="phone-pad"
            maxLength={10}
            error={errors.mobile}
          />

          {/* Village Selector */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{t('village', language)}</Text>
            <TouchableOpacity
              style={styles.selectButton}
              onPress={() => setVillageModalVisible(true)}
            >
              <Ionicons name="business-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.selectText}>
                {selectedVillage ? selectedVillage.name : t('selectOrCreateVillage', language)}
              </Text>
              <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Opening Balance */}
          <Input
            label={t('openingBalance', language)}
            placeholder="0"
            prefix="₹"
            value={openingBalance}
            onChangeText={setOpeningBalance}
            keyboardType="numeric"
            helperText={t('openingBalanceHelper', language)}
          />

          {/* Address / Landmark */}
          <Input
            label={t('address', language)}
            placeholder={language === 'hi' ? 'मकान नंबर, गली, या लैंडमार्क' : 'Address, street or landmark'}
            value={address}
            onChangeText={setAddress}
          />

          {/* Notes */}
          <Input
            label={t('notes', language)}
            placeholder={language === 'hi' ? 'अन्य कोई जानकारी या संदर्भ' : 'Any additional notes'}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={2}
          />

          <Button
            title={isEditing ? t('save', language) : t('saveTransaction', language)}
            onPress={handleSave}
            loading={loading}
            variant="primary"
            size="lg"
            style={styles.saveBtn}
          />

          {isEditing && (
            <Button
              title={t('deleteCustomer', language)}
              onPress={handleDeleteCustomer}
              loading={loading}
              variant="danger"
              size="lg"
              icon={<Ionicons name="trash-outline" size={18} color="#FFFFFF" />}
              style={styles.deleteBtn}
            />
          )}
        </Card>
      </ScrollView>

      {/* Village Picker / Quick Add Modal */}
      <Modal visible={villageModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('selectVillage', language)}</Text>
              <TouchableOpacity onPress={() => setVillageModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Quick Add Village Input */}
            <View style={styles.quickAddRow}>
              <Input
                placeholder={language === 'hi' ? 'नया गाँव जोड़ें...' : 'Add new village...'}
                value={newVillageName}
                onChangeText={setNewVillageName}
                containerStyle={{ flex: 1, marginBottom: 0 }}
              />
              <Button
                title={t('addVillage', language)}
                onPress={handleQuickAddVillage}
                variant="primary"
                size="md"
                style={{ height: 48 }}
              />
            </View>

            <FlatList
              data={villages}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 260, marginTop: Spacing.md }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.villageOption,
                    selectedVillage?.id === item.id && styles.selectedOption,
                  ]}
                  onPress={() => {
                    setSelectedVillage(item);
                    setVillageModalVisible(false);
                  }}
                >
                  <Ionicons
                    name="location-outline"
                    size={18}
                    color={selectedVillage?.id === item.id ? Colors.primary : Colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.villageOptionText,
                      selectedVillage?.id === item.id && styles.selectedOptionText,
                    ]}
                  >
                    {item.name}
                  </Text>
                  {selectedVillage?.id === item.id && (
                    <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
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
  scrollContent: {
    padding: Spacing.lg,
  },
  fieldContainer: {
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    height: 48,
    gap: Spacing.sm,
  },
  selectText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  saveBtn: {
    marginTop: Spacing.md,
  },
  deleteBtn: {
    marginTop: Spacing.md,
  },
  headerDeleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  quickAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  villageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  selectedOption: {
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.sm,
  },
  villageOptionText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  selectedOptionText: {
    fontWeight: '700',
    color: Colors.primary,
  },
});
