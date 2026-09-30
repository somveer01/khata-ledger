import React, { useState, useEffect, useCallback } from 'react';
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
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
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
import { confirmAction, showAlert } from '../../utils/dialog';
import {
  isContactPickerSupported,
  pickContactFromDevice,
  parseContactText,
  sanitizeIndianPhoneNumber,
} from '../../utils/contacts';

export const AddEditCustomerScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { business, language, refreshAllData, isAuthenticated, guardAction, dataVersion } = useApp();

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
  const [existingCustomers, setExistingCustomers] = useState<Customer[]>([]);
  const [villageModalVisible, setVillageModalVisible] = useState(false);
  const [newVillageName, setNewVillageName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Quick contact import states
  const [pasteModalVisible, setPasteModalVisible] = useState(false);
  const [rawContactText, setRawContactText] = useState('');
  const [parsedPreview, setParsedPreview] = useState<{ name: string; mobile: string }>({
    name: '',
    mobile: '',
  });

  const handleImportFromDevice = async () => {
    try {
      const contact = await pickContactFromDevice();
      if (contact) {
        if (contact.name) setName(contact.name);
        if (contact.mobile) setMobile(sanitizeIndianPhoneNumber(contact.mobile));
        showAlert(
          t('success', language),
          t('contactImportedSuccess', language),
          undefined,
          'success'
        );
      }
    } catch (err) {
      console.log('Error importing contact:', err);
    }
  };

  const handleOpenContactOption = () => {
    if (isContactPickerSupported()) {
      handleImportFromDevice();
    } else {
      setRawContactText('');
      setParsedPreview({ name: '', mobile: '' });
      setPasteModalVisible(true);
    }
  };

  const handlePasteTextChange = (text: string) => {
    setRawContactText(text);
    const parsed = parseContactText(text);
    setParsedPreview(parsed);
  };

  const handleApplyPastedContact = () => {
    const parsed =
      parsedPreview.name || parsedPreview.mobile
        ? parsedPreview
        : parseContactText(rawContactText);
    if (!parsed.name && !parsed.mobile) {
      showAlert(t('error', language), t('contactImportFailed', language), undefined, 'warning');
      return;
    }
    if (parsed.name) setName(parsed.name);
    if (parsed.mobile) setMobile(sanitizeIndianPhoneNumber(parsed.mobile));
    setPasteModalVisible(false);
    setRawContactText('');
    showAlert(
      t('success', language),
      t('contactImportedSuccess', language),
      undefined,
      'success'
    );
  };

  const loadData = useCallback(async () => {
    if (!business) return;
    const [vList, cList] = await Promise.all([
      DataRepository.getVillages(business.id),
      DataRepository.getCustomers(business.id),
    ]);
    setVillages(vList);
    setExistingCustomers(cList);

    if (existingCustomer?.villageId) {
      const found = vList.find((v) => v.id === existingCustomer.villageId);
      setSelectedVillage(found || (vList.length > 0 ? vList[0] : null));
    } else {
      setSelectedVillage((prev) => {
        if (prev && !vList.some((v) => v.id === prev.id)) {
          return vList.length > 0 ? vList[0] : null;
        }
        return prev || (vList.length > 0 ? vList[0] : null);
      });
    }
  }, [business, existingCustomer]);

  useEffect(() => {
    loadData();
  }, [loadData, dataVersion]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const checkDuplicateCustomer = (customerName: string, village: Village | null): boolean => {
    const normName = customerName.trim().toLowerCase();
    const targetVillageId = (village?.id || '').trim();
    const targetVillageName = (village?.name || '').trim().toLowerCase();

    return existingCustomers.some((c) => {
      // Exclude customer currently being edited
      if (existingCustomer && c.id === existingCustomer.id) return false;

      const cName = c.name.trim().toLowerCase();
      if (cName !== normName) return false;

      const cVillageId = (c.villageId || '').trim();
      const cVillageName = (c.villageName || '').trim().toLowerCase();

      if (targetVillageId && cVillageId) {
        return targetVillageId === cVillageId || (targetVillageName && cVillageName && targetVillageName === cVillageName);
      }
      return targetVillageName === cVillageName;
    });
  };

  const handleMobileChange = (val: string) => {
    // If user is pasting or typing with prefixes (+91, 0, o, O, spaces, dashes)
    // or if the text is longer than 10 chars, sanitize it immediately
    let cleanVal = val;
    if (
      val.startsWith('+') ||
      val.startsWith('0') ||
      val.startsWith('o') ||
      val.startsWith('O') ||
      val.includes(' ') ||
      val.includes('-') ||
      val.length > 10
    ) {
      cleanVal = sanitizeIndianPhoneNumber(val);
    } else {
      // Direct typing: replace letter o/O with 0 and remove non-digits
      cleanVal = val.replace(/[oO]/g, '0').replace(/\D/g, '');
    }
    setMobile(cleanVal);
    if (errors.mobile) {
      setErrors((prev) => ({ ...prev, mobile: '' }));
    }
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    const trimmedName = name.trim();
    if (!trimmedName) {
      errs.name = t('enterCustomerNameError', language);
    } else if (checkDuplicateCustomer(trimmedName, selectedVillage)) {
      const vName = selectedVillage?.name;
      errs.name = vName
        ? (language === 'hi'
            ? `गाँव "${vName}" में "${trimmedName}" नाम का ग्राहक पहले से मौजूद है।`
            : `A customer named "${trimmedName}" already exists in village "${vName}".`)
        : (language === 'hi'
            ? `"${trimmedName}" नाम का ग्राहक पहले से मौजूद है।`
            : `A customer named "${trimmedName}" already exists.`);
    }

    const cleanMobile = sanitizeIndianPhoneNumber(mobile);
    if (mobile.trim() && cleanMobile.length !== 10) {
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
    if (errors.name) {
      setErrors((prev) => ({ ...prev, name: '' }));
    }
    setNewVillageName('');
    setVillageModalVisible(false);
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
      const cleanMobile = mobile.trim() ? sanitizeIndianPhoneNumber(mobile) : '';

      const customerToSave: Customer = {
        id: existingCustomer?.id || `cust_${Date.now()}`,
        businessId: business.id,
        name: name.trim(),
        mobile: cleanMobile,
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

        showAlert(
          t('success', language),
          t('customerSavedSuccess', language),
          onDone,
          'success'
        );
      } else {
        const vName = selectedVillage?.name;
        const dupMsg = vName
          ? (language === 'hi'
              ? `गाँव "${vName}" में "${name.trim()}" नाम का ग्राहक पहले से मौजूद है।`
              : `A customer named "${name.trim()}" already exists in village "${vName}".`)
          : (language === 'hi'
              ? `"${name.trim()}" नाम का ग्राहक पहले से मौजूद है।`
              : `A customer named "${name.trim()}" already exists.`);
        setErrors((prev) => ({ ...prev, name: dupMsg }));
        showAlert(t('error', language), dupMsg, undefined, 'warning');
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
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card>
          {/* Customer Name */}
          <Input
            label={`${t('customerName', language)} *`}
            placeholder={language === 'hi' ? 'जैसे: शिवनन्दन' : 'e.g. Shivnandan'}
            value={name}
            onChangeText={(val) => {
              setName(val);
              if (errors.name) {
                setErrors((prev) => ({ ...prev, name: '' }));
              }
            }}
            error={errors.name}
            autoFocus={!isEditing}
          />

          {/* Mobile Number with inline contact button */}
          <View style={styles.fieldHeaderRow}>
            <Text style={styles.fieldLabel}>{t('mobileNumber', language)}</Text>
            {!isEditing && (
              <TouchableOpacity
                onPress={handleOpenContactOption}
                style={styles.inlineImportBtn}
                activeOpacity={0.6}
              >
                <Ionicons name="person-add" size={13} color={Colors.primary} />
                <Text style={styles.inlineImportText}>{t('importContact', language)}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Input
            placeholder={language === 'hi' ? '10 अंकों का मोबाइल नंबर' : '10 digit mobile number'}
            value={mobile}
            onChangeText={handleMobileChange}
            keyboardType="phone-pad"
            maxLength={16}
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
            title={isEditing ? t('updateCustomerBtn', language) : t('registerBtn', language)}
            onPress={handleSave}
            loading={loading}
            variant="primary"
            size="lg"
            style={styles.saveBtn}
          />
        </Card>
      </ScrollView>

      {/* Quick Paste / Import Contact Modal */}
      <Modal visible={pasteModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <Ionicons name="person-add" size={20} color={Colors.primary} />
                <Text style={styles.modalTitle}>{t('pasteContactModalTitle', language)}</Text>
              </View>
              <TouchableOpacity onPress={() => setPasteModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalHelperText}>
              {t('pasteContactModalDesc', language)}
            </Text>

            <Input
              placeholder={t('pasteContactPlaceholder', language)}
              value={rawContactText}
              onChangeText={handlePasteTextChange}
              multiline
              numberOfLines={3}
              containerStyle={{ marginTop: Spacing.sm, marginBottom: Spacing.md }}
            />

            {(parsedPreview.name || parsedPreview.mobile) ? (
              <View style={styles.previewBox}>
                <Text style={styles.previewTitle}>
                  {language === 'hi' ? 'पहचाना गया विवरण:' : 'Detected Information:'}
                </Text>
                {parsedPreview.name ? (
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>{t('detectedName', language)}:</Text>
                    <Text style={styles.previewVal}>{parsedPreview.name}</Text>
                  </View>
                ) : null}
                {parsedPreview.mobile ? (
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>{t('detectedMobile', language)}:</Text>
                    <Text style={styles.previewVal}>{parsedPreview.mobile}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <Button
              title={t('autoFillBtn', language)}
              onPress={handleApplyPastedContact}
              variant="primary"
              size="lg"
              disabled={!rawContactText.trim()}
              style={{ marginTop: Spacing.sm }}
            />
          </View>
        </View>
      </Modal>

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
                    if (errors.name) {
                      setErrors((prev) => ({ ...prev, name: '' }));
                    }
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
  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  inlineImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(30, 58, 138, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  inlineImportText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
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
  modalHelperText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    lineHeight: 18,
  },
  previewBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: 4,
  },
  previewTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  previewLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  previewVal: {
    fontSize: 14,
    fontWeight: '700',
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
