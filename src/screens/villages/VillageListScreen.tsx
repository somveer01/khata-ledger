import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { t } from '../../i18n';
import { formatCurrency } from '../../utils/money';
import { DataRepository } from '../../services/db';
import { PdfService } from '../../services/pdfService';
import { Village, VillageSummary } from '../../types';
import { confirmAction } from '../../utils/dialog';
import { Ionicons } from '@expo/vector-icons';

export const VillageListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { business, language, refreshAllData, guardAction } = useApp();

  const [summaries, setSummaries] = useState<VillageSummary[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [villageName, setVillageName] = useState('');
  const [editingVillage, setEditingVillage] = useState<Village | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadData = useCallback(async () => {
    if (!business) return;
    const list = await DataRepository.getVillageSummaries(business.id);
    setSummaries(list);
  }, [business]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleSaveVillage = async () => {
    if (!villageName.trim() || !business) return;

    const v: Village = {
      id: editingVillage ? editingVillage.id : `vil_${Date.now()}`,
      businessId: business.id,
      name: villageName.trim(),
      status: 'ACTIVE',
      createdAt: editingVillage ? editingVillage.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await DataRepository.saveVillage(v);
    if (!res.success) {
      Alert.alert(t('error', language), res.error || t('duplicateVillageWarning', language));
      return;
    }

    setVillageName('');
    setEditingVillage(null);
    setModalVisible(false);
    await refreshAllData();
    await loadData();
    Alert.alert(t('success', language), editingVillage ? t('villageUpdatedSuccess', language) : t('success', language));
  };

  const handleEditVillage = (item: VillageSummary) => {
    guardAction(() => {
      setEditingVillage({
        id: item.villageId,
        businessId: business?.id || '',
        name: item.villageName,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setVillageName(item.villageName);
      setModalVisible(true);
    });
  };

  const handleDeleteVillage = async (item: VillageSummary) => {
    if (!business) return;

    guardAction(async () => {
      // Check if transactions exist for customers of this village
      const allTxs = await DataRepository.getTransactions(business.id);
      const allCusts = await DataRepository.getCustomers(business.id);
      const villageCustIds = new Set(allCusts.filter((c) => c.villageId === item.villageId).map((c) => c.id));
      const matchingTxs = allTxs.filter(
        (t) => (t.customerId && villageCustIds.has(t.customerId)) || t.villageName === item.villageName
      );

      if (matchingTxs.length > 0) {
        const msg =
          language === 'hi'
            ? `गाँव "${item.villageName}" में ${villageCustIds.size} ग्राहक और ${matchingTxs.length} लेन-देन दर्ज हैं।\n\nखाता-बही की सुरक्षा के लिए, सक्रिय लेन-देन वाले गाँव को नहीं हटाया जा सकता।\n\nकृपया पहले संबंधित लेन-देन हटाएं या ग्राहकों का गाँव बदलें।`
            : `Village "${item.villageName}" has ${villageCustIds.size} customer(s) with ${matchingTxs.length} recorded transaction(s).\n\nTo preserve accounting records, villages with active transactions cannot be deleted.\n\nPlease delete or reassign all related transactions first.`;
        Alert.alert(t('cannotDeleteVillageTitle', language), msg);
        return;
      }

      const confirmMsg =
        language === 'hi'
          ? `क्या आप सचमुच गाँव "${item.villageName}" को हटाना चाहते हैं?`
          : `Are you sure you want to delete village "${item.villageName}"?`;

      confirmAction(
        t('deleteVillage', language),
        confirmMsg,
        async () => {
          if (!business) return;
          const res = await DataRepository.deleteVillage(business.id, item.villageId);
          if (res.success) {
            setModalVisible(false);
            setEditingVillage(null);
            setVillageName('');
            await refreshAllData();
            await loadData();
            const successMsg =
              language === 'hi'
                ? `गाँव "${item.villageName}" सफलतापूर्वक हटा दिया गया।`
                : `Village "${item.villageName}" deleted successfully.`;
            if (Platform.OS === 'web') {
              window.alert(successMsg);
            } else {
              Alert.alert(t('success', language), successMsg);
            }
          } else if (res.error === 'HAS_TRANSACTIONS') {
            if (Platform.OS === 'web') {
              window.alert(`${t('cannotDeleteVillageTitle', language)}\n\n${t('cannotDeleteVillageHasTx', language)}`);
            } else {
              Alert.alert(
                t('cannotDeleteVillageTitle', language),
                t('cannotDeleteVillageHasTx', language)
              );
            }
          } else {
            const errMsg = res.error || 'Failed to delete village';
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
    });
  };

  const handleExportPdf = async () => {
    if (!business || summaries.length === 0 || exporting) return;
    setExporting(true);
    try {
      const totalDue = summaries.reduce((acc, v) => acc + v.totalOutstandingPaise, 0);
      const uri = await PdfService.generateVillageReportPdf(business, summaries, totalDue);
      await PdfService.sharePdf(uri, undefined, 'Villages Report');
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (
        !msg.includes('canceled') &&
        !msg.includes('cancelled') &&
        !msg.includes('rejected') &&
        !msg.includes('dismissed')
      ) {
        Alert.alert(t('error', language), msg || 'Error generating report');
      }
    } finally {
      setTimeout(() => setExporting(false), 700);
    }
  };

  const totalAllVillagesDue = summaries.reduce((acc, v) => acc + v.totalOutstandingPaise, 0);

  return (
    <View style={styles.screen}>
      <Header
        title={t('villageReport', language)}
        subtitle={`${summaries.length} ${t('villages', language)}`}
        showBack
        onBack={() => navigation.navigate('DashboardTab')}
        rightAction={
          <TouchableOpacity onPress={handleExportPdf} style={styles.exportIconBtn} disabled={exporting}>
            <Ionicons name="share-outline" size={20} color={Colors.textInverse} />
          </TouchableOpacity>
        }
      />

      <View style={styles.container}>
        {/* Village Summary Total Banner */}
        <Card style={styles.totalBannerCard}>
          <View style={styles.totalRow}>
            <View>
              <Text style={styles.bannerLabel}>{t('allVillagesTotalDue', language)}</Text>
              <Text style={styles.bannerAmount}>{formatCurrency(totalAllVillagesDue)}</Text>
            </View>
            <Button
              title={t('pdfShareBtn', language)}
              onPress={handleExportPdf}
              loading={exporting}
              size="sm"
              variant="outline"
              icon={<Ionicons name="document-text-outline" size={14} color={Colors.primary} />}
            />
          </View>
        </Card>

        {/* Village List */}
        <FlatList
          data={summaries}
          keyExtractor={(item) => item.villageId}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => navigation.navigate('VillageDetail', { villageSummary: item })}
            >
              <Card style={styles.villageCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.villageIcon}>
                    <Ionicons name="business" size={20} color={Colors.warning} />
                  </View>
                  <View style={styles.villageInfo}>
                    <Text style={styles.villageName}>{item.villageName}</Text>
                    <Text style={styles.customerCountText}>
                      {item.customerCount} {t('customersCountLabel', language)} • {item.customersWithDueCount} {t('withDuesCountLabel', language)}
                    </Text>
                  </View>
                  <View style={styles.dueBox}>
                    <Text style={styles.dueAmount}>{formatCurrency(item.totalOutstandingPaise)}</Text>
                    <Badge
                      label={item.totalOutstandingPaise > 0 ? t('statusDue', language) : t('statusSettled', language)}
                      variant={item.totalOutstandingPaise > 0 ? 'danger' : 'success'}
                      size="sm"
                    />
                  </View>

                  <View style={styles.cardActionBtns}>
                    <TouchableOpacity
                      style={styles.cardActionBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleEditVillage(item);
                      }}
                    >
                      <Ionicons name="pencil" size={15} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.cardActionBtn, styles.cardDeleteBtn]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDeleteVillage(item);
                      }}
                    >
                      <Ionicons name="trash-outline" size={15} color={Colors.creditSale} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Sub row showing credit vs collections */}
                <View style={styles.subStatsRow}>
                  <Text style={styles.subStatText}>
                    {t('debit', language)}: <Text style={{ color: Colors.creditSale, fontWeight: '700' }}>{formatCurrency(item.totalCreditPaise)}</Text>
                  </Text>
                  <Text style={styles.subStatText}>
                    {t('credit', language)}: <Text style={{ color: Colors.paymentReceived, fontWeight: '700' }}>{formatCurrency(item.totalPaymentPaise)}</Text>
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </View>
              </Card>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="business-outline"
              title={t('noVillages', language)}
              description={t('noVillagesDesc', language)}
              actionTitle={t('addVillage', language)}
              onAction={() => {
                setEditingVillage(null);
                setVillageName('');
                setModalVisible(true);
              }}
            />
          }
        />
      </View>

      {/* Floating Add Village Button */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => {
          guardAction(() => {
            setEditingVillage(null);
            setVillageName('');
            setModalVisible(true);
          });
        }}
      >
        <Ionicons name="add" size={30} color={Colors.textInverse} />
      </TouchableOpacity>

      {/* Add / Edit Village Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingVillage ? t('editVillage', language) : t('addVillage', language)}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Input
              label={t('villageName', language)}
              placeholder={language === 'hi' ? 'जैसे: सिकन्दरपुर' : 'e.g. Sikandarpur'}
              value={villageName}
              onChangeText={setVillageName}
              autoFocus
            />

            <Button
              title={t('save', language)}
              onPress={handleSaveVillage}
              variant="primary"
              size="md"
              style={{ marginTop: Spacing.sm }}
            />

            {editingVillage && (
              <Button
                title={t('deleteVillage', language)}
                variant="danger"
                size="md"
                icon={<Ionicons name="trash-outline" size={16} color="#FFFFFF" />}
                onPress={() => {
                  const summary = summaries.find((s) => s.villageId === editingVillage.id);
                  if (summary) {
                    handleDeleteVillage(summary);
                  }
                }}
                style={{ marginTop: Spacing.sm }}
              />
            )}
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
  container: {
    flex: 1,
  },
  exportIconBtn: {
    padding: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  totalBannerCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
    padding: Spacing.md,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bannerLabel: {
    fontSize: 11,
    color: '#991B1B',
    fontWeight: '600',
  },
  bannerAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.creditSale,
    marginTop: 2,
  },
  listContent: {
    padding: Spacing.lg,
    paddingBottom: 80,
  },
  villageCard: {
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  villageIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  villageInfo: {
    flex: 1,
  },
  villageName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  customerCountText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  dueBox: {
    alignItems: 'flex-end',
    marginRight: Spacing.sm,
  },
  dueAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.creditSale,
    marginBottom: 2,
  },
  cardActionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 4,
  },
  cardActionBtn: {
    padding: 6,
    borderRadius: BorderRadius.md,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  cardDeleteBtn: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  subStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: BorderRadius.sm,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
  },
  subStatText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
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
});
