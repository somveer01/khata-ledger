import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { DataRepository } from '../../services/db';
import { UnitOfMeasurement, UOMCategory } from '../../types';
import { showAlert, confirmAction } from '../../utils/dialog';
import { t } from '../../i18n';

type FilterCategory = 'ALL' | UOMCategory;

export const UomMasterScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { business, language } = useApp();

  const [loading, setLoading] = useState(true);
  const [uoms, setUoms] = useState<UnitOfMeasurement[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>('ALL');

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUom, setEditingUom] = useState<UnitOfMeasurement | null>(null);
  const [code, setCode] = useState('');
  const [nameHi, setNameHi] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [category, setCategory] = useState<UOMCategory>('PACKAGING');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    if (!business) return;
    setLoading(true);
    try {
      const list = await DataRepository.getUOMs(business.id);
      setUoms(list);
    } catch (err) {
      console.warn('Error loading UOMs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [business?.id]);

  const filteredUoms = useMemo(() => {
    let result = [...uoms];
    if (selectedCategory !== 'ALL') {
      result = result.filter((u) => u.category === selectedCategory);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (u) =>
          u.code.toLowerCase().includes(q) ||
          u.nameHi.toLowerCase().includes(q) ||
          u.nameEn.toLowerCase().includes(q)
      );
    }
    return result;
  }, [uoms, selectedCategory, search]);

  const handleOpenAddModal = () => {
    setEditingUom(null);
    setCode('');
    setNameHi('');
    setNameEn('');
    setCategory('PACKAGING');
    setModalVisible(true);
  };

  const handleOpenEditModal = (item: UnitOfMeasurement) => {
    setEditingUom(item);
    setCode(item.code);
    setNameHi(item.nameHi);
    setNameEn(item.nameEn);
    setCategory(item.category);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!business) return;
    if (!code.trim()) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'कृपया इकाई कोड (उदा. BOX, KG) दर्ज करें।' : 'Please enter UOM code.', undefined, 'danger');
      return;
    }
    if (!nameHi.trim() && !nameEn.trim()) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'कृपया इकाई का नाम दर्ज करें।' : 'Please enter UOM name.', undefined, 'danger');
      return;
    }

    setSaving(true);
    try {
      const uomId = editingUom ? editingUom.id : `uom_custom_${Date.now()}`;
      const itemToSave: UnitOfMeasurement = {
        id: uomId,
        businessId: business.id,
        code: code.trim().toUpperCase(),
        nameHi: nameHi.trim() || nameEn.trim(),
        nameEn: nameEn.trim() || nameHi.trim(),
        category,
        isSystemDefault: editingUom ? editingUom.isSystemDefault : false,
        createdAt: editingUom ? editingUom.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await DataRepository.saveUOM(itemToSave);
      setModalVisible(false);
      await loadData();
      showAlert(language === 'hi' ? 'सफल' : 'Success', language === 'hi' ? 'इकाई सफलतापूर्वक सुरक्षित की गई।' : 'Unit saved successfully.', undefined, 'success');
    } catch (err: any) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', err.message, undefined, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item: UnitOfMeasurement) => {
    if (!business) return;
    if (item.isSystemDefault) {
      showAlert(language === 'hi' ? 'सूचना' : 'Info', language === 'hi' ? 'यह सिस्टम डिफ़ॉल्ट इकाई है और इसे हटाया नहीं जा सकता।' : 'System default unit cannot be deleted.', undefined, 'warning');
      return;
    }

    confirmAction(
      language === 'hi' ? 'इकाई हटाएं' : 'Delete Unit',
      language === 'hi' ? `क्या आप निश्चित रूप से "${item.nameHi} (${item.code})" को हटाना चाहते हैं?` : `Are you sure you want to delete "${item.nameEn} (${item.code})"?`,
      async () => {
        const res = await DataRepository.deleteUOM(business.id, item.id);
        if (res.success) {
          await loadData();
          showAlert(language === 'hi' ? 'सफल' : 'Success', language === 'hi' ? 'इकाई हटा दी गई।' : 'Unit deleted.', undefined, 'success');
        } else {
          showAlert(language === 'hi' ? 'त्रुटि' : 'Error', res.error || 'Failed to delete unit', undefined, 'danger');
        }
      },
      language === 'hi' ? 'हटाएं' : 'Delete',
      language === 'hi' ? 'रद्द करें' : 'Cancel',
      'danger'
    );
  };

  const getCategoryBadge = (cat: UOMCategory) => {
    switch (cat) {
      case 'PACKAGING':
        return { label: language === 'hi' ? 'पैकेजिंग' : 'Packaging', bg: '#FEF3C7', color: '#B45309' };
      case 'WEIGHT':
        return { label: language === 'hi' ? 'वज़न' : 'Weight', bg: '#DCFCE7', color: '#15803D' };
      case 'VOLUME':
        return { label: language === 'hi' ? 'आयतन' : 'Volume', bg: '#E0F2FE', color: '#0369A1' };
      case 'COUNT':
        return { label: language === 'hi' ? 'संख्या / नग' : 'Count', bg: '#EDE9FE', color: '#6D28D9' };
      default:
        return { label: cat, bg: '#F1F5F9', color: '#475569' };
    }
  };

  const renderUomItem = ({ item }: { item: UnitOfMeasurement }) => {
    const badge = getCategoryBadge(item.category);

    return (
      <Card style={styles.uomCard}>
        <View style={styles.cardLeft}>
          <View style={styles.codeBadge}>
            <Text style={styles.codeBadgeText}>{item.code}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.nameHi}>{item.nameHi}</Text>
            <Text style={styles.nameEn}>{item.nameEn}</Text>
            <View style={[styles.categoryBadge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.categoryBadgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
          </View>
        </View>

        <View style={styles.cardActions}>
          {item.isSystemDefault ? (
            <View style={styles.defaultPill}>
              <Ionicons name="lock-closed" size={11} color="#64748B" />
              <Text style={styles.defaultPillText}>{language === 'hi' ? 'डिफ़ॉल्ट' : 'System'}</Text>
            </View>
          ) : (
            <View style={styles.actionBtnRow}>
              <TouchableOpacity
                onPress={() => handleOpenEditModal(item)}
                style={styles.actionBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="pencil" size={16} color={Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDelete(item)}
                style={[styles.actionBtn, styles.deleteBtn]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={16} color={Colors.danger} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.screen}>
      <Header
        title={language === 'hi' ? 'इकाई मास्टर (UOM)' : 'UOM Master'}
        subtitle={language === 'hi' ? 'माप व पैकेजिंग की मानक इकाइयाँ' : 'Measurement & Packaging Units'}
        showBack={true}
      />

      <View style={styles.searchContainer}>
        <Input
          placeholder={language === 'hi' ? 'इकाई खोजें (उदा. Box, Kg, बोतल)...' : 'Search unit...'}
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

      {/* Category Filter Chips */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {[
            { id: 'ALL', label: language === 'hi' ? 'सभी (All)' : 'All' },
            { id: 'PACKAGING', label: language === 'hi' ? 'पेटी / बोरी (Packaging)' : 'Packaging' },
            { id: 'WEIGHT', label: language === 'hi' ? 'वज़न (Weight)' : 'Weight' },
            { id: 'VOLUME', label: language === 'hi' ? 'तरल / आयतन (Volume)' : 'Volume' },
            { id: 'COUNT', label: language === 'hi' ? 'नग / पीस (Count)' : 'Count' },
          ].map((chip) => {
            const active = selectedCategory === chip.id;
            return (
              <TouchableOpacity
                key={chip.id}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setSelectedCategory(chip.id as FilterCategory)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>{language === 'hi' ? 'इकाइयाँ लोड हो रही हैं...' : 'Loading units...'}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredUoms}
          keyExtractor={(item) => item.id}
          renderItem={renderUomItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="scale-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>{language === 'hi' ? 'कोई इकाई नहीं मिली' : 'No units found'}</Text>
              <Text style={styles.emptySub}>{language === 'hi' ? 'नीचे दिए गए बटन से नई इकाई जोड़ें।' : 'Add a new unit using the button below.'}</Text>
            </View>
          }
        />
      )}

      {/* Floating Add Button */}
      <TouchableOpacity
        style={[styles.fab, { bottom: Math.max(insets.bottom, 16) + 16 }]}
        onPress={handleOpenAddModal}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={24} color="#FFFFFF" />
        <Text style={styles.fabText}>{language === 'hi' ? 'नई इकाई' : 'Add Unit'}</Text>
      </TouchableOpacity>

      {/* Add / Edit Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingUom
                  ? (language === 'hi' ? 'इकाई बदलें' : 'Edit Unit')
                  : (language === 'hi' ? 'नई इकाई जोड़ें' : 'Add New Unit')}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Input
                label={language === 'hi' ? 'इकाई कोड / सिंबल (उदा. BOX, KG, LTR)' : 'Unit Code / Symbol (e.g. BOX, KG)'}
                placeholder="BOX, PKT, BTL, KG..."
                value={code}
                onChangeText={(text) => setCode(text.toUpperCase())}
                autoCapitalize="characters"
              />

              <Input
                label={language === 'hi' ? 'नाम (हिंदी में - उदा. पेटी, बोरी, पैकेट)' : 'Name (Hindi)'}
                placeholder="उदा. पेटी / बॉक्स"
                value={nameHi}
                onChangeText={setNameHi}
              />

              <Input
                label={language === 'hi' ? 'नाम (अंग्रेज़ी में - उदा. Box, Packet)' : 'Name (English)'}
                placeholder="e.g. Box, Packet, Bag"
                value={nameEn}
                onChangeText={setNameEn}
              />

              <Text style={styles.inputLabel}>{language === 'hi' ? 'श्रेणी (Category)' : 'Category'}</Text>
              <View style={styles.categoryPickerRow}>
                {(['PACKAGING', 'WEIGHT', 'VOLUME', 'COUNT'] as UOMCategory[]).map((cat) => {
                  const active = category === cat;
                  const badge = getCategoryBadge(cat);
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.categoryChoice, active && { borderColor: Colors.primary, backgroundColor: '#EFF6FF' }]}
                      onPress={() => setCategory(cat)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.categoryChoiceText, active && { color: Colors.primary, fontWeight: '700' }]}>
                        {badge.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title={language === 'hi' ? 'रद्द करें' : 'Cancel'}
                variant="outline"
                onPress={() => setModalVisible(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title={language === 'hi' ? 'सुरक्षित करें' : 'Save Unit'}
                variant="primary"
                loading={saving}
                onPress={handleSave}
                style={{ flex: 1, marginLeft: 8 }}
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
    backgroundColor: '#F8FAFC',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  filterBar: {
    marginBottom: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  uomCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    marginBottom: 10,
    borderRadius: 14,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  codeBadge: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  codeBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primary,
  },
  infoBox: {
    flex: 1,
  },
  nameHi: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  nameEn: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardActions: {
    marginLeft: 10,
  },
  defaultPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  defaultPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    backgroundColor: '#FEF2F2',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 28,
    elevation: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  fabText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  categoryPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  categoryChoice: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  categoryChoiceText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 10,
  },
});
