import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { t } from '../../i18n';
import { Business, SupportedLanguage } from '../../types';
import { Ionicons } from '@expo/vector-icons';

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const {
    business,
    language,
    setLanguage,
    updateBusiness,
    isFirebaseActive,
    seedDemoData,
    clearData,
    user,
    isGuest,
    isAuthenticated,
    showAuthModal,
    logout,
  } = useApp();

  const [name, setName] = useState(business?.name || '');
  const [ownerName, setOwnerName] = useState(business?.ownerName || '');
  const [phone, setPhone] = useState(business?.phone || '');
  const [address, setAddress] = useState(business?.address || '');
  const [upiId, setUpiId] = useState(business?.upiId || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (business) {
      setName(business.name || '');
      setOwnerName(business.ownerName || '');
      setPhone(business.phone || '');
      setAddress(business.address || '');
      setUpiId(business.upiId || '');
    }
  }, [business]);

  const handleLanguageChange = async (newLang: SupportedLanguage) => {
    await setLanguage(newLang);
  };

  const handleSaveBusiness = async () => {
    if (!business) return;
    if (!name.trim()) {
      Alert.alert(t('error', language), t('enterShopNameError', language));
      return;
    }

    setSaving(true);
    const updated: Business = {
      ...business,
      name: name.trim(),
      ownerName: ownerName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      upiId: upiId.trim(),
      updatedAt: new Date().toISOString(),
    };
    await updateBusiness(updated);
    setSaving(false);
    Alert.alert(t('success', language), t('businessSavedSuccess', language));
  };

  const handleSeedReferenceData = () => {
    Alert.alert(
      t('seedSampleDataConfirmTitle', language),
      t('seedSampleDataConfirmDesc', language),
      [
        { text: t('cancel', language), style: 'cancel' },
        {
          text: t('confirm', language),
          onPress: async () => {
            await seedDemoData();
            Alert.alert(t('success', language), t('seedSampleDataSuccess', language));
          },
        },
      ]
    );
  };

  const handleClearAll = () => {
    Alert.alert(
      t('clearAllDataConfirmTitle', language),
      t('clearAllDataConfirmDesc', language),
      [
        { text: t('cancel', language), style: 'cancel' },
        {
          text: t('delete', language),
          style: 'destructive',
          onPress: async () => {
            await clearData();
            Alert.alert(t('success', language), t('clearAllDataSuccess', language));
          },
        },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <Header
        title={t('navSettings', language)}
        subtitle={language === 'hi' ? 'दुकान विवरण, भाषा एवं डेटा प्रबंधन' : 'Shop profile, language, and data settings'}
        showBack
        onBack={() => navigation.navigate('DashboardTab')}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Account & Authentication Card */}
        <Card style={styles.accountCard}>
          <View style={styles.accountHeaderRow}>
            <View style={[styles.accountIconBox, isAuthenticated ? styles.accountIconActive : styles.accountIconGuest]}>
              <Ionicons
                name={isAuthenticated ? 'person-circle' : 'person-outline'}
                size={24}
                color={isAuthenticated ? Colors.primary : '#D97706'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>{t('account', language)}</Text>
              <Text style={styles.accountSubText}>
                {isAuthenticated
                  ? `${t('loggedInAs', language)}: ${user?.email}`
                  : t('guestModeNotice', language)}
              </Text>
            </View>
          </View>

          {isAuthenticated ? (
            <Button
              title={t('logout', language)}
              variant="outline"
              size="sm"
              onPress={() => {
                Alert.alert(
                  t('logoutConfirmTitle', language),
                  t('logoutConfirmDesc', language),
                  [
                    { text: t('cancel', language), style: 'cancel' },
                    { text: t('logout', language), style: 'destructive', onPress: () => logout() },
                  ]
                );
              }}
              style={{ marginTop: Spacing.sm }}
            />
          ) : (
            <Button
              title={`${t('login', language)} / ${t('register', language)}`}
              variant="primary"
              size="sm"
              onPress={() => showAuthModal()}
              style={{ marginTop: Spacing.sm }}
            />
          )}
        </Card>

        {/* Language Selection Card (Exclusive location in settings screen) */}
        <Card style={styles.languageCard}>
          <View style={styles.langHeader}>
            <Ionicons name="language" size={22} color={Colors.primary} />
            <Text style={styles.sectionTitle}>{t('language', language)}</Text>
          </View>

          <View style={styles.langRow}>
            {/* Hindi Option */}
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.langChoice, language === 'hi' && styles.activeLangChoice]}
              onPress={() => handleLanguageChange('hi')}
            >
              <View style={styles.langTextCol}>
                <Text style={[styles.langChoiceTitle, language === 'hi' && styles.activeLangChoiceText]}>
                  हिंदी (Hindi)
                </Text>
                <Text style={styles.langChoiceSub}>सम्पूर्ण ऐप हिंदी में</Text>
              </View>
              {language === 'hi' ? (
                <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
              ) : (
                <Ionicons name="ellipse-outline" size={24} color={Colors.textMuted} />
              )}
            </TouchableOpacity>

            {/* English Option */}
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.langChoice, language === 'en' && styles.activeLangChoice]}
              onPress={() => handleLanguageChange('en')}
            >
              <View style={styles.langTextCol}>
                <Text style={[styles.langChoiceTitle, language === 'en' && styles.activeLangChoiceText]}>
                  English
                </Text>
                <Text style={styles.langChoiceSub}>All app in English</Text>
              </View>
              {language === 'en' ? (
                <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
              ) : (
                <Ionicons name="ellipse-outline" size={24} color={Colors.textMuted} />
              )}
            </TouchableOpacity>
          </View>
        </Card>

        {/* Sync / Firebase Status Card */}
        <Card style={styles.syncCard}>
          <View style={styles.syncHeader}>
            <View style={styles.syncIconBox}>
              <Ionicons
                name={isFirebaseActive ? 'cloud-done' : 'save-outline'}
                size={22}
                color={isFirebaseActive ? Colors.paymentReceived : Colors.warning}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.syncTitle}>
                {isFirebaseActive ? 'Firebase Cloud Firestore' : t('offline', language)}
              </Text>
              <Text style={styles.syncDesc}>
                {isFirebaseActive ? t('firebaseActiveNotice', language) : t('demoModeNotice', language)}
              </Text>
            </View>
          </View>
        </Card>

        {/* Business Profile Editor */}
        <Card>
          <Text style={styles.sectionTitle}>{t('businessProfile', language)}</Text>

          <Input
            label={t('businessName', language)}
            value={name}
            onChangeText={setName}
            placeholder={language === 'hi' ? 'दुकान का नाम' : 'Shop / Business Name'}
          />

          <Input
            label={t('ownerName', language)}
            value={ownerName}
            onChangeText={setOwnerName}
            placeholder={language === 'hi' ? 'मालिक का नाम' : 'Owner Name'}
          />

          <Input
            label={t('phone', language)}
            value={phone}
            onChangeText={setPhone}
            placeholder={language === 'hi' ? 'मोबाइल नंबर' : 'Phone Number'}
            keyboardType="phone-pad"
          />

          <Input
            label={t('address', language)}
            value={address}
            onChangeText={setAddress}
            placeholder={language === 'hi' ? 'दुकान का पता व शहर' : 'Shop Address & City'}
          />

          <Input
            label={t('upiId', language)}
            value={upiId}
            onChangeText={setUpiId}
            placeholder="e.g. shopname@upi"
            helperText={t('upiIdHelper', language)}
          />

          <Button
            title={t('saveBusinessBtn', language)}
            onPress={handleSaveBusiness}
            loading={saving}
            variant="primary"
            size="md"
            style={{ marginTop: Spacing.xs }}
          />
        </Card>

        {/* Sample Data & Reset */}
        <Card>
          <Text style={styles.sectionTitle}>{t('dataControls', language)}</Text>

          <Button
            title={t('seedSampleData', language)}
            onPress={handleSeedReferenceData}
            variant="outline"
            size="md"
            icon={<Ionicons name="book-outline" size={18} color={Colors.primary} />}
            style={{ marginBottom: Spacing.md }}
          />

          <Button
            title={t('clearAllData', language)}
            onPress={handleClearAll}
            variant="danger"
            size="md"
            icon={<Ionicons name="trash-outline" size={18} color={Colors.textInverse} />}
          />
        </Card>

        {/* App Info Footer */}
        <View style={styles.appFooter}>
          <Text style={styles.appNameText}>{t('versionFooter', language)}</Text>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
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
  accountCard: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    marginBottom: Spacing.md,
  },
  accountHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  accountIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountIconActive: {
    backgroundColor: '#DCFCE7',
  },
  accountIconGuest: {
    backgroundColor: '#FEF3C7',
  },
  accountSubText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  languageCard: {
    borderWidth: 2,
    borderColor: '#BFDBFE',
    backgroundColor: '#FFFFFF',
  },
  langHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  langRow: {
    gap: Spacing.sm,
  },
  langChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSubtle,
  },
  activeLangChoice: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  langTextCol: {
    flex: 1,
  },
  langChoiceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  langChoiceSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  activeLangChoiceText: {
    color: Colors.primary,
  },
  syncCard: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    padding: Spacing.md,
  },
  syncHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  syncIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.paymentReceivedText,
  },
  syncDesc: {
    fontSize: 11,
    color: '#15803D',
    marginTop: 2,
  },
  appFooter: {
    alignItems: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  appNameText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
});
