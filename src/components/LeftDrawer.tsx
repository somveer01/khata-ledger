import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  ScrollView,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';
import { useApp } from '../context/AppContext';
import { t } from '../i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 340);

export const LeftDrawer: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { business, language, isDrawerOpen, closeDrawer, isSuperAdmin } = useApp();

  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isDrawerOpen) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isDrawerOpen, slideAnim, fadeAnim]);

  if (!isDrawerOpen) return null;

  const handleNavigate = (screenName: string, params?: any) => {
    closeDrawer();
    setTimeout(() => {
      try {
        navigation.navigate(screenName, params);
      } catch (err) {
        console.warn('Navigation error from drawer:', err);
      }
    }, 150);
  };

  return (
    <Modal
      transparent
      visible={isDrawerOpen}
      animationType="none"
      onRequestClose={closeDrawer}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Backdrop Tap to Close */}
        <TouchableWithoutFeedback onPress={closeDrawer}>
          <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} />
        </TouchableWithoutFeedback>

        {/* Sliding Left Panel */}
        <Animated.View
          style={[
            styles.drawerContainer,
            {
              width: DRAWER_WIDTH,
              paddingTop: insets.top + (Platform.OS === 'ios' ? 8 : 16),
              paddingBottom: Math.max(insets.bottom, 16),
              transform: [{ translateX: slideAnim }],
            },
          ]}
        >
          {/* Header Card */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.logoBadge}>
                <Ionicons name="storefront" size={24} color="#FFFFFF" />
              </View>
              <TouchableOpacity
                onPress={closeDrawer}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.storeName} numberOfLines={1}>
              {business?.name || (language === 'hi' ? 'मेरा खाता बही' : 'My Khata Ledger')}
            </Text>

            <View style={styles.ownerRow}>
              <Ionicons name="person-circle-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.ownerName} numberOfLines={1}>
                {business?.ownerName || (language === 'hi' ? 'दुकानदार' : 'Store Owner')}
              </Text>
            </View>

            {isSuperAdmin && (
              <View style={styles.adminPill}>
                <Ionicons name="shield-checkmark" size={11} color="#1E3A8A" />
                <Text style={styles.adminPillText}>
                  {language === 'hi' ? 'सुपर एडमिन (सभी दुकानें)' : 'Super Admin'}
                </Text>
              </View>
            )}
          </View>

          {/* Scrollable Navigation Options */}
          <ScrollView
            style={styles.menuScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.menuScrollContent}
          >
            {/* Section 1: UOM & Rates */}
            <Text style={styles.sectionHeader}>
              {language === 'hi' ? 'उत्पाद व इकाई मास्टर' : 'Master Management'}
            </Text>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleNavigate('ProductList')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconBox, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="cube" size={20} color="#16A34A" />
              </View>
              <View style={styles.menuTextBox}>
                <Text style={styles.menuTitle}>{t('rateMaster', language)}</Text>
                <Text style={styles.menuSub}>
                  {language === 'hi' ? 'उत्पाद दरें व मार्जिन' : 'Products & Pricing'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleNavigate('UomMaster')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconBox, { backgroundColor: '#EDE9FE' }]}>
                <Ionicons name="scale-outline" size={20} color="#7C3AED" />
              </View>
              <View style={styles.menuTextBox}>
                <Text style={styles.menuTitle}>{t('uomMaster', language)}</Text>
                <Text style={styles.menuSub}>
                  {language === 'hi' ? 'बोतल, पेटी, बोरी, किलो आदि' : 'Bottle, Box, Bag, Kg, Pc'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleNavigate('UomConversion')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconBox, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="swap-horizontal" size={20} color="#D97706" />
              </View>
              <View style={styles.menuTextBox}>
                <Text style={styles.menuTitle}>{t('uomConversions', language)}</Text>
                <Text style={styles.menuSub}>
                  {language === 'hi' ? '1 पेटी = 10 नग (रूपांतरण)' : '1 Box = 10 Pcs rules'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* Section 2: Inventory & Purchase */}
            <Text style={styles.sectionHeader}>
              {language === 'hi' ? 'खरीद व इन्वेंट्री (Stock)' : 'Inventory & Buying'}
            </Text>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleNavigate('StockLedger')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconBox, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="layers" size={20} color="#16A34A" />
              </View>
              <View style={styles.menuTextBox}>
                <Text style={styles.menuTitle}>{t('stockLedger', language)}</Text>
                <Text style={styles.menuSub}>
                  {language === 'hi' ? 'खरीद - बिक्री = शेष स्टॉक' : 'Live Remaining Stock'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleNavigate('StockAdjustment')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconBox, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="shield-half-outline" size={20} color="#DC2626" />
              </View>
              <View style={styles.menuTextBox}>
                <Text style={styles.menuTitle}>{t('stockAdjustment', language)}</Text>
                <Text style={styles.menuSub}>
                  {language === 'hi' ? 'डैमेज, एक्सपायरी व ऑडिट अंतर' : 'Damage, Expiry & Audits'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleNavigate('PurchaseList')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconBox, { backgroundColor: '#E0E7FF' }]}>
                <Ionicons name="cart" size={20} color="#4F46E5" />
              </View>
              <View style={styles.menuTextBox}>
                <Text style={styles.menuTitle}>{t('purchaseList', language)}</Text>
                <Text style={styles.menuSub}>
                  {language === 'hi' ? 'सप्लायर बिल व माल आवक' : 'Dealer Purchases'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleNavigate('SupplierList')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconBox, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="people" size={20} color="#D97706" />
              </View>
              <View style={styles.menuTextBox}>
                <Text style={styles.menuTitle}>{t('suppliers', language)}</Text>
                <Text style={styles.menuSub}>
                  {language === 'hi' ? 'डीलर व सप्लायर उधारी खाता' : 'Dealer Accounts & Dues'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* Section 3: Core Operations */}
            <Text style={styles.sectionHeader}>
              {language === 'hi' ? 'मुख्य लेन-देन व खाते' : 'General Ledger'}
            </Text>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleNavigate('DashboardTab')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconBox, { backgroundColor: 'rgba(30, 58, 138, 0.1)' }]}>
                <Ionicons name="home" size={20} color={Colors.primary} />
              </View>
              <View style={styles.menuTextBox}>
                <Text style={styles.menuTitle}>{t('navDashboard', language)}</Text>
                <Text style={styles.menuSub}>{language === 'hi' ? 'होम व मुख्य समरी' : 'Home overview'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleNavigate('CustomersTab')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconBox, { backgroundColor: 'rgba(13, 148, 136, 0.1)' }]}>
                <Ionicons name="people" size={20} color="#0D9488" />
              </View>
              <View style={styles.menuTextBox}>
                <Text style={styles.menuTitle}>{t('navCustomers', language)}</Text>
                <Text style={styles.menuSub}>{language === 'hi' ? 'ग्राहक सूची व खाता बही' : 'Customer Ledger'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleNavigate('VillagesTab')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconBox, { backgroundColor: 'rgba(217, 119, 6, 0.1)' }]}>
                <Ionicons name="business" size={20} color={Colors.warning} />
              </View>
              <View style={styles.menuTextBox}>
                <Text style={styles.menuTitle}>{t('navVillages', language)}</Text>
                <Text style={styles.menuSub}>{language === 'hi' ? 'गाँव अनुसार उधारी' : 'Village-wise Dues'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleNavigate('ReportsTab')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconBox, { backgroundColor: 'rgba(2, 132, 199, 0.1)' }]}>
                <Ionicons name="bar-chart" size={20} color={Colors.info} />
              </View>
              <View style={styles.menuTextBox}>
                <Text style={styles.menuTitle}>{t('navReports', language)}</Text>
                <Text style={styles.menuSub}>{language === 'hi' ? 'दैनिक बिक्री व जमा रिपोर्ट' : 'Daily Analytics'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleNavigate('SettingsTab')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconBox, { backgroundColor: '#F1F5F9' }]}>
                <Ionicons name="settings-outline" size={20} color={Colors.textSecondary} />
              </View>
              <View style={styles.menuTextBox}>
                <Text style={styles.menuTitle}>{t('navSettings', language)}</Text>
                <Text style={styles.menuSub}>{language === 'hi' ? 'सुरक्षा पिन, भाषा व बैकअप' : 'Language & Security'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </ScrollView>

          {/* Footer Info */}
          <View style={styles.footer}>
            <View style={styles.footerBadge}>
              <Ionicons name="shield-checkmark" size={13} color="#16A34A" />
              <Text style={styles.footerBadgeText}>
                {language === 'hi' ? '100% सुरक्षित व ऑफ़लाइन सक्षम' : '100% Secure & Offline Ready'}
              </Text>
            </View>
            <Text style={styles.footerVersion}>खाता बही (Khata-Book) v2.5</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
  },
  drawerContainer: {
    backgroundColor: '#FFFFFF',
    height: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeName: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  ownerName: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  adminPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  adminPillText: {
    fontSize: 11,
    color: '#1E3A8A',
    fontWeight: '700',
  },
  menuScroll: {
    flex: 1,
  },
  menuScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 4,
    backgroundColor: '#FFFFFF',
  },
  menuItemDisabled: {
    opacity: 0.75,
  },
  menuIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuTextBox: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  menuSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  badgeComingSoon: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  badgeComingSoonText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    alignItems: 'center',
  },
  footerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginBottom: 6,
  },
  footerBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
  },
  footerVersion: {
    fontSize: 11,
    color: Colors.textMuted,
  },
});
