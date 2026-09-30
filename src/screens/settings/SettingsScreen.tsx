import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { t } from '../../i18n';
import { Business, SupportedLanguage } from '../../types';
import { Ionicons } from '@expo/vector-icons';
import { confirmAction, showAlert } from '../../utils/dialog';
import { StoreSwitcherModal } from '../../components/StoreSwitcherModal';

let deferredInstallPrompt: any = null;

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });
}

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
    resetPassword,
    isSuperAdmin,
    availableBusinesses,
  } = useApp();

  const [storeModalVisible, setStoreModalVisible] = useState(false);
  const [name, setName] = useState(business?.name || '');
  const [ownerName, setOwnerName] = useState(business?.ownerName || '');
  const [phone, setPhone] = useState(business?.phone || '');
  const [address, setAddress] = useState(business?.address || '');
  const [upiId, setUpiId] = useState(business?.upiId || '');
  const [saving, setSaving] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      setIsInstalled(isStandalone);
    }
  }, []);

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
      showAlert(t('error', language), t('enterShopNameError', language), undefined, 'danger');
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
    showAlert(t('success', language), t('businessSavedSuccess', language), undefined, 'success');
  };

  const handleSeedReferenceData = () => {
    confirmAction(
      t('seedSampleDataConfirmTitle', language),
      t('seedSampleDataConfirmDesc', language),
      async () => {
        try {
          await seedDemoData();
          showAlert(t('success', language), t('seedSampleDataSuccess', language), undefined, 'success');
        } catch (err: any) {
          showAlert(t('error', language), err.message || 'Error seeding demo data', undefined, 'danger');
        }
      },
      t('confirm', language),
      t('cancel', language),
      'warning'
    );
  };

  const handleClearAll = () => {
    confirmAction(
      t('clearAllDataConfirmTitle', language),
      t('clearAllDataConfirmDesc', language),
      async () => {
        try {
          await clearData();
          showAlert(t('success', language), t('clearAllDataSuccess', language), undefined, 'success');
        } catch (err: any) {
          showAlert(t('error', language), err.message || 'Error clearing data', undefined, 'danger');
        }
      },
      t('delete', language),
      t('cancel', language),
      'danger'
    );
  };

  const handleInstallApp = async () => {
    if (Platform.OS === 'web') {
      const promptEvent = (typeof window !== 'undefined' && (window as any).__pwaInstallPrompt) || deferredInstallPrompt;
      if (promptEvent) {
        promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice?.outcome === 'accepted') {
          setIsInstalled(true);
        }
        if (typeof window !== 'undefined') (window as any).__pwaInstallPrompt = null;
        deferredInstallPrompt = null;
        return;
      }

      if (isInstalled) {
        showAlert(t('installApp', language), t('installAppAlreadyInstalled', language), undefined, 'info');
        return;
      }

      const isIos = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      if (isIos) {
        showAlert(t('installApp', language), t('installAppIosGuide', language), undefined, 'info');
      } else {
        showAlert(t('installApp', language), t('installAppAndroidGuide', language), undefined, 'info');
      }
    } else {
      showAlert(t('installApp', language), t('installAppAlreadyInstalled', language), undefined, 'info');
    }
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdate(true);
    try {
      if (Platform.OS === 'web') {
        await fetch(`index.html?t=${Date.now()}`, { cache: 'no-store' }).catch(() => {});
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.update().catch(() => {});
          }
        }
      }
    } catch {
      // ignore network errors
    }
    setTimeout(() => {
      setCheckingUpdate(false);
      if (Platform.OS === 'web') {
        confirmAction(
          t('appUpToDate', language),
          language === 'hi'
            ? 'क्या आप नए कैश के साथ ऐप रीलोड करना चाहते हैं?'
            : 'Would you like to reload the app with fresh cache?',
          () => {
            window.location.reload();
          },
          language === 'hi' ? 'रीलोड करें' : 'Reload',
          t('cancel', language),
          'info'
        );
      } else {
        showAlert(t('updateApp', language), t('appUpToDate', language), undefined, 'success');
      }
    }, 700);
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
                  ? `${user?.email?.toLowerCase().includes('somveerkushwaha') ? 'Somveer Kushwaha • ' : (user?.displayName && !user.displayName.toLowerCase().includes('shiv') ? `${user.displayName} • ` : '')}${t('loggedInAs', language)}: ${user?.email}`
                  : t('guestModeNotice', language)}
              </Text>
            </View>
          </View>

          {isAuthenticated ? (
            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
              <Button
                title={t('resetPassword', language)}
                variant="outline"
                size="sm"
                icon={<Ionicons name="key-outline" size={16} color={Colors.primary} />}
                onPress={() => {
                  if (!user?.email) return;
                  confirmAction(
                    t('sendResetLinkConfirmTitle', language),
                    `${t('sendResetLinkConfirmDesc', language)} ${user.email}?`,
                    async () => {
                      const res = await resetPassword(user.email!);
                      if (res.success) {
                        showAlert(
                          t('success', language),
                          t('passwordResetSentAlert', language),
                          undefined,
                          'success'
                        );
                      } else {
                        showAlert(
                          t('error', language),
                          res.error || 'Failed to send reset link',
                          undefined,
                          'danger'
                        );
                      }
                    },
                    t('sendResetLink', language),
                    t('cancel', language),
                    'info'
                  );
                }}
                style={{ flex: 1 }}
              />
              <Button
                title={t('logout', language)}
                variant="outline"
                size="sm"
                onPress={() => {
                  const isSomveer = user?.email?.toLowerCase().includes('somveerkushwaha');
                  const accountName = isSomveer
                    ? 'Somveer Kushwaha'
                    : (user?.displayName && !user.displayName.toLowerCase().includes('shiv')
                        ? user.displayName
                        : user?.email?.split('@')[0] || t('account', language));
                  confirmAction(
                    t('logoutConfirmTitle', language),
                    `${t('account', language)}: ${accountName}\n${t('loggedInAs', language)}: ${user?.email || ''}\n\n${t('logoutConfirmDesc', language)}`,
                    () => logout(),
                    t('logout', language),
                    t('cancel', language),
                    'logout'
                  );
                }}
                style={{ flex: 1 }}
              />
            </View>
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

        {/* Super Admin Multi-Store Switcher Card */}
        {isSuperAdmin && (
          <Card style={styles.superAdminCard}>
            <View style={styles.superAdminHeaderRow}>
              <View style={styles.superAdminIconBox}>
                <Ionicons name="shield-checkmark" size={24} color="#0D9488" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.sectionTitle}>
                    {language === 'hi' ? '👑 सुपर एडमिन कंट्रोल' : '👑 Super Admin Control'}
                  </Text>
                  <View style={styles.superAdminBadge}>
                    <Text style={styles.superAdminBadgeText}>Master</Text>
                  </View>
                </View>
                <Text style={styles.superAdminSubText}>
                  {language === 'hi'
                    ? 'आप सभी पंजीकृत दुकानों का खाता देख व स्विच कर सकते हैं।'
                    : 'You can view and switch between all registered stores.'}
                </Text>
              </View>
            </View>

            <View style={styles.currentStoreRow}>
              <Text style={styles.currentStoreLabel}>
                {language === 'hi' ? 'वर्तमान चुनी हुई दुकान:' : 'Current Active Store:'}
              </Text>
              <Text style={styles.currentStoreValue}>
                {business?.name || 'Ledger'} {business?.ownerName ? `(${business.ownerName})` : ''}
              </Text>
            </View>

            <Button
              title={language === 'hi' ? 'दुकान बदलें (Store Switcher)' : 'Switch Store'}
              variant="primary"
              size="sm"
              icon={<Ionicons name="storefront-outline" size={16} color="#FFFFFF" />}
              onPress={() => setStoreModalVisible(true)}
              style={{ marginTop: Spacing.sm }}
            />
          </Card>
        )}

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

        {/* App Installation & Updates Card */}
        <Card style={styles.appMgmtCard}>
          <View style={styles.appMgmtHeader}>
            <View style={styles.appMgmtIconBox}>
              <Ionicons name="phone-portrait-outline" size={22} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>{t('appManagement', language)}</Text>
              <Text style={styles.appMgmtSub}>{t('installAppDesc', language)}</Text>
            </View>
          </View>

          {/* Version Info Row */}
          <View style={styles.appVersionRow}>
            <View>
              <Text style={styles.appVersionLabel}>{t('appVersion', language)}</Text>
              <Text style={styles.appVersionValue}>v1.0.0</Text>
            </View>
            <Badge
              label={t('appUpToDateStatus', language)}
              variant="success"
              size="sm"
            />
          </View>

          <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
            <Button
              title={isInstalled ? t('installAppAlreadyInstalled', language) : t('installApp', language)}
              onPress={handleInstallApp}
              variant={isInstalled ? 'outline' : 'primary'}
              size="md"
              icon={
                <Ionicons
                  name={isInstalled ? 'checkmark-circle' : 'download-outline'}
                  size={18}
                  color={isInstalled ? Colors.paymentReceived : '#FFFFFF'}
                />
              }
            />

            <Button
              title={t('updateApp', language)}
              onPress={handleCheckUpdates}
              loading={checkingUpdate}
              variant="outline"
              size="md"
              icon={<Ionicons name="sync-outline" size={18} color={Colors.primary} />}
            />
          </View>
        </Card>

        {/* App Info Footer */}
        <View style={styles.appFooter}>
          <Text style={styles.appNameText}>{t('versionFooter', language)}</Text>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      {isSuperAdmin && (
        <StoreSwitcherModal
          visible={storeModalVisible}
          onClose={() => setStoreModalVisible(false)}
        />
      )}
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
  appMgmtCard: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    marginBottom: Spacing.md,
  },
  appMgmtHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  appMgmtIconBox: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appMgmtSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  appVersionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  appVersionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  appVersionValue: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  superAdminCard: {
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    backgroundColor: '#F0FDFA',
    marginBottom: Spacing.md,
  },
  superAdminHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  superAdminIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  superAdminBadge: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
  },
  superAdminBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  superAdminSubText: {
    fontSize: 12,
    color: '#0F766E',
    marginTop: 2,
  },
  currentStoreRow: {
    backgroundColor: '#FFFFFF',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#CCFBF1',
    marginTop: Spacing.sm,
  },
  currentStoreLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  currentStoreValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 2,
  },
});
