import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';
import { useApp } from '../context/AppContext';
import { t } from '../i18n';
import { Ionicons } from '@expo/vector-icons';
import { confirmAction } from '../utils/dialog';
import { StoreSwitcherModal } from './StoreSwitcherModal';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showBack = false,
  onBack,
  rightAction,
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [storeModalVisible, setStoreModalVisible] = useState(false);
  const {
    business,
    language,
    isFirebaseActive,
    user,
    isAuthenticated,
    showAuthModal,
    logout,
    isSuperAdmin,
    availableBusinesses,
  } = useApp();

  const handleUserPress = () => {
    const isSomveer = user?.email?.toLowerCase().includes('somveerkushwaha') || false;
    const accountName = isSomveer
      ? 'Somveer Kushwaha'
      : (user?.displayName && !user.displayName.toLowerCase().includes('shiv')
          ? user.displayName
          : user?.email?.split('@')[0] || t('account', language));
    const userEmail = user?.email || (isSomveer ? 'somveerkushwaha@gmail.com' : '');

    confirmAction(
      t('logoutConfirmTitle', language),
      `${t('account', language)}: ${accountName}\n${t('loggedInAs', language)}: ${userEmail}\n\n${t('logoutConfirmDesc', language)}`,
      () => logout(),
      t('logout', language),
      t('cancel', language),
      'logout'
    );
  };

  const getHeaderAccountText = () => {
    if (!user) return t('account', language);
    if (user.email?.toLowerCase().includes('somveerkushwaha')) return 'Somveer';
    if (user.displayName && !user.displayName.toLowerCase().includes('shiv')) {
      return user.displayName;
    }
    return user.email ? user.email.split('@')[0] : t('account', language);
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (navigation && typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    if (navigation && typeof navigation.navigate === 'function') {
      navigation.navigate('MainTabs', { screen: 'DashboardTab' });
    }
  };

  return (
    <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={styles.topRow}>
        {showBack ? (
          <TouchableOpacity
            onPress={handleBack}
            style={styles.iconButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.textInverse} />
          </TouchableOpacity>
        ) : (
          <View style={styles.logoContainer}>
            <Ionicons name="book" size={22} color={Colors.warning} />
          </View>
        )}

        <View style={styles.titlesContainer}>
          <Text numberOfLines={1} style={styles.mainTitle}>
            {title || business?.name || t('appName', language)}
          </Text>
          <Text numberOfLines={1} style={styles.subTitle}>
            {subtitle || (business ? `${business.ownerName} • ${business.phone}` : t('tagline', language))}
          </Text>
        </View>

        {rightAction ? <View style={styles.rightActions}>{rightAction}</View> : null}
      </View>

      {/* Sync / Offline Status Bar */}
      <View style={styles.syncBar}>
        <View style={styles.syncIndicator}>
          <View style={[styles.dot, isFirebaseActive ? styles.dotGreen : styles.dotAmber]} />
          <Text numberOfLines={1} style={styles.syncText}>
            {isFirebaseActive
              ? (language === 'hi' ? 'फ़ायरबेस बैकअप' : 'Cloud Sync')
              : (language === 'hi' ? 'सुरक्षित ऑफ़लाइन' : 'Offline Mode')}
          </Text>
        </View>

        <View style={styles.syncRightRow}>
          {isSuperAdmin && availableBusinesses.length > 0 && (
            <TouchableOpacity
              style={styles.storeSwitcherPill}
              onPress={() => setStoreModalVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="storefront" size={12} color="#FEF08A" />
              <Text numberOfLines={1} style={styles.storeSwitcherText}>
                {language === 'hi' ? 'दुकान बदलें ▾' : 'Switch ▾'}
              </Text>
            </TouchableOpacity>
          )}

          {isAuthenticated ? (
            <TouchableOpacity
              style={styles.authPill}
              onPress={handleUserPress}
              activeOpacity={0.7}
            >
              <Ionicons name="person-circle" size={13} color="#DCFCE7" />
              <Text numberOfLines={1} style={styles.authPillText}>
                {getHeaderAccountText()}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.authPill, styles.authPillGuest]}
              onPress={() => showAuthModal()}
              activeOpacity={0.7}
            >
              <Ionicons name="log-in-outline" size={13} color="#FEF3C7" />
              <Text style={[styles.authPillText, styles.authPillGuestText]}>
                {t('guestUser', language)} ({t('login', language)})
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

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
  headerContainer: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  logoContainer: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  titlesContainer: {
    flex: 1,
  },
  mainTitle: {
    ...Typography.h3,
    color: Colors.textInverse,
  },
  subTitle: {
    ...Typography.small,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  syncIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotGreen: {
    backgroundColor: '#4ADE80',
  },
  dotAmber: {
    backgroundColor: '#FBBF24',
  },
  syncText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },
  syncRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  storeSwitcherPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(234, 179, 8, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(254, 240, 138, 0.5)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  storeSwitcherText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FEF08A',
  },
  authPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    maxWidth: 160,
  },
  authPillGuest: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.4)',
  },
  authPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DCFCE7',
  },
  authPillGuestText: {
    color: '#FEF3C7',
    fontWeight: '700',
  },
});
