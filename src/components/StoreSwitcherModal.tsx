import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';
import { useApp } from '../context/AppContext';
import { Business } from '../types';

interface StoreSwitcherModalProps {
  visible: boolean;
  onClose: () => void;
}

export const StoreSwitcherModal: React.FC<StoreSwitcherModalProps> = ({ visible, onClose }) => {
  const {
    business,
    availableBusinesses,
    switchBusiness,
    refreshAvailableBusinesses,
    language,
  } = useApp();

  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleSelectBusiness = async (targetBiz: Business) => {
    if (targetBiz.id === business?.id) {
      onClose();
      return;
    }
    setSwitchingId(targetBiz.id);
    try {
      await switchBusiness(targetBiz);
      onClose();
    } finally {
      setSwitchingId(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshAvailableBusinesses();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.crownIconBox}>
                <Ionicons name="storefront" size={20} color={Colors.primary} />
              </View>
              <View>
                <Text style={styles.title}>
                  {language === 'hi' ? 'दुकान चुनें (Store Switcher)' : 'Select Store'}
                </Text>
                <Text style={styles.subtitle}>
                  {language === 'hi' ? 'सुपर एडमिन कंट्रोल (Somveer)' : 'Super Admin Access'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Description */}
          <View style={styles.noticeBox}>
            <Ionicons name="shield-checkmark" size={16} color="#0D9488" style={{ marginTop: 2 }} />
            <Text style={styles.noticeText}>
              {language === 'hi'
                ? 'आप सभी पंजीकृत दुकानों का डेटा देख सकते हैं। जिस दुकान का डेटा देखना या मैनेज करना हो, उस पर टैप करें।'
                : 'As Super Admin, you can access and switch between any registered store to view their ledger.'}
            </Text>
          </View>

          {/* Store List */}
          <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
            {availableBusinesses.map((b) => {
              const isActive = b.id === business?.id;
              const isSwitching = switchingId === b.id;

              return (
                <TouchableOpacity
                  key={b.id}
                  style={[
                    styles.bizItem,
                    isActive && styles.bizItemActive,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => handleSelectBusiness(b)}
                  disabled={isSwitching}
                >
                  <View style={[styles.bizIconBox, isActive && styles.bizIconBoxActive]}>
                    <Ionicons
                      name={isActive ? 'checkmark-circle' : 'business'}
                      size={22}
                      color={isActive ? Colors.primary : Colors.textMuted}
                    />
                  </View>

                  <View style={styles.bizInfo}>
                    <View style={styles.bizTitleRow}>
                      <Text style={[styles.bizName, isActive && styles.bizNameActive]} numberOfLines={1}>
                        {b.name || (language === 'hi' ? 'अनाम दुकान' : 'Unnamed Store')}
                      </Text>
                      {isActive && (
                        <View style={styles.activeBadge}>
                          <Text style={styles.activeBadgeText}>
                            {language === 'hi' ? 'सक्रिय' : 'Active'}
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.bizMeta} numberOfLines={1}>
                      {b.ownerName ? `${b.ownerName}` : ''}
                      {b.phone ? ` • ${b.phone}` : ''}
                      {b.address ? ` • ${b.address}` : ''}
                    </Text>

                    {b.ownerEmail ? (
                      <Text style={styles.bizEmail} numberOfLines={1}>
                        {b.ownerEmail}
                      </Text>
                    ) : null}
                  </View>

                  {isSwitching ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : !isActive ? (
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons name="sync" size={16} color={Colors.primary} />
              )}
              <Text style={styles.refreshBtnText}>
                {language === 'hi' ? 'दुकानें रीफ़्रेश करें' : 'Refresh Stores'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeModalBtn} onPress={onClose}>
              <Text style={styles.closeModalBtnText}>
                {language === 'hi' ? 'बंद करें' : 'Close'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  crownIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: 1,
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  noticeBox: {
    flexDirection: 'row',
    gap: Spacing.xs,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  noticeText: {
    flex: 1,
    fontSize: 11,
    color: '#0F766E',
    lineHeight: 16,
    fontWeight: '500',
  },
  listContainer: {
    maxHeight: 340,
    marginBottom: Spacing.md,
  },
  bizItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  bizItemActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  bizIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bizIconBoxActive: {
    backgroundColor: '#FFFFFF',
  },
  bizInfo: {
    flex: 1,
  },
  bizTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  bizName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  bizNameActive: {
    color: Colors.primary,
  },
  activeBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bizMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  bizEmail: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  refreshBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  closeModalBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceSubtle,
  },
  closeModalBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
});
