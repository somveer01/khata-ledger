import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
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
import { UnitOfMeasurement, UnitConversion } from '../../types';
import { showAlert, confirmAction } from '../../utils/dialog';
import { t } from '../../i18n';

export const UomConversionScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { business, language } = useApp();

  const [loading, setLoading] = useState(true);
  const [conversions, setConversions] = useState<UnitConversion[]>([]);
  const [uoms, setUoms] = useState<UnitOfMeasurement[]>([]);

  // Search & Filter on main list
  const [search, setSearch] = useState('');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState('ALL');

  // Interactive Live Calculator (Ultra-slim single line)
  const [calcQty, setCalcQty] = useState('5');
  const [calcFromUomId, setCalcFromUomId] = useState('uom_box');
  const [calcDropdownOpen, setCalcDropdownOpen] = useState(false);
  const [calcDropdownSearch, setCalcDropdownSearch] = useState('');

  // Add / Edit Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingConversion, setEditingConversion] = useState<UnitConversion | null>(null);
  const [fromUomId, setFromUomId] = useState('');
  const [toUomId, setToUomId] = useState('');
  const [factor, setFactor] = useState('10');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // In-Modal Searchable Dropdown State (Directly inside modal, NEVER goes behind popup)
  const [modalDropdown, setModalDropdown] = useState<'from' | 'to' | null>(null);
  const [modalDropdownSearch, setModalDropdownSearch] = useState('');

  const loadData = async () => {
    if (!business) return;
    setLoading(true);
    try {
      const [cList, uList] = await Promise.all([
        DataRepository.getUOMConversions(business.id),
        DataRepository.getUOMs(business.id),
      ]);
      setConversions(cList);
      setUoms(uList);
      if (uList.length > 0 && !fromUomId) {
        setFromUomId(uList[0].id);
        setToUomId(uList[uList.length > 1 ? 1 : 0].id);
      }
      if (cList.length > 0 && !calcFromUomId) {
        setCalcFromUomId(cList[0].fromUOMId);
      }
    } catch (err) {
      console.warn('Error loading conversions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [business?.id]);

  const handleOpenAddModal = () => {
    setEditingConversion(null);
    const boxUom = uoms.find((u) => u.code === 'BOX') || uoms[0];
    const pcUom = uoms.find((u) => u.code === 'PC') || uoms[1] || uoms[0];
    setFromUomId(boxUom ? boxUom.id : '');
    setToUomId(pcUom ? pcUom.id : '');
    setFactor('10');
    setDescription('');
    setModalDropdown(null);
    setModalDropdownSearch('');
    setModalVisible(true);
  };

  const handleOpenEditModal = (item: UnitConversion) => {
    setEditingConversion(item);
    setFromUomId(item.fromUOMId);
    setToUomId(item.toUOMId);
    setFactor(item.conversionFactor.toString());
    setDescription(item.description || '');
    setModalDropdown(null);
    setModalDropdownSearch('');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!business) return;
    if (!fromUomId || !toUomId) {
      showAlert(
        language === 'hi' ? 'त्रुटि' : 'Error',
        language === 'hi' ? 'कृपया दोनों इकाइयाँ चुनें।' : 'Please select both units.',
        undefined,
        'danger'
      );
      return;
    }
    if (fromUomId === toUomId) {
      showAlert(
        language === 'hi' ? 'त्रुटि' : 'Error',
        language === 'hi' ? 'दोनों इकाइयाँ अलग-अलग होनी चाहिए।' : 'From and To units must be different.',
        undefined,
        'danger'
      );
      return;
    }
    const factorNum = parseFloat(factor);
    if (isNaN(factorNum) || factorNum <= 0) {
      showAlert(
        language === 'hi' ? 'त्रुटि' : 'Error',
        language === 'hi' ? 'कृपया सही संख्या (अनुपात) दर्ज करें।' : 'Please enter a valid conversion factor.',
        undefined,
        'danger'
      );
      return;
    }

    const fromUom = uoms.find((u) => u.id === fromUomId);
    const toUom = uoms.find((u) => u.id === toUomId);

    setSaving(true);
    try {
      const convId = editingConversion
        ? editingConversion.id
        : `conv_${fromUom?.code.toLowerCase()}_${toUom?.code.toLowerCase()}_${Date.now()}`;
      const defaultDesc = `1 ${fromUom?.nameHi || fromUom?.code} = ${factorNum} ${toUom?.nameHi || toUom?.code}`;

      const convPayload: UnitConversion = {
        id: convId,
        businessId: business.id,
        fromUOMId: fromUomId,
        fromUOMCode: fromUom?.code,
        toUOMId: toUomId,
        toUOMCode: toUom?.code,
        conversionFactor: factorNum,
        description: description.trim() || defaultDesc,
        createdAt: editingConversion ? editingConversion.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await DataRepository.saveUOMConversion(convPayload);
      setModalVisible(false);
      await loadData();
      showAlert(
        language === 'hi' ? 'सफल' : 'Success',
        editingConversion
          ? language === 'hi'
            ? 'रूपांतरण नियम सफलतापूर्वक अपडेट हो गया।'
            : 'Conversion rule updated successfully.'
          : language === 'hi'
          ? 'रूपांतरण नियम सुरक्षित हो गया।'
          : 'Conversion rule saved successfully.',
        undefined,
        'success'
      );
    } catch (err: any) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', err.message, undefined, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item: UnitConversion) => {
    if (!business) return;

    confirmAction(
      language === 'hi' ? 'नियम हटाएं' : 'Delete Rule',
      language === 'hi'
        ? `क्या आप निश्चित रूप से "${item.description || 'रूपांतरण'}" को हटाना चाहते हैं?`
        : 'Are you sure you want to delete this conversion rule?',
      async () => {
        const res = await DataRepository.deleteUOMConversion(business.id, item.id);
        if (res.success) {
          await loadData();
          showAlert(
            language === 'hi' ? 'सफल' : 'Success',
            language === 'hi' ? 'नियम हटा दिया गया।' : 'Rule deleted.',
            undefined,
            'success'
          );
        } else {
          showAlert(language === 'hi' ? 'त्रुटि' : 'Error', res.error || 'Failed to delete rule', undefined, 'danger');
        }
      },
      language === 'hi' ? 'हटाएं' : 'Delete',
      language === 'hi' ? 'रद्द करें' : 'Cancel',
      'danger'
    );
  };

  // Calculator computation (Single Line)
  const calcResult = useMemo(() => {
    const q = parseFloat(calcQty);
    if (isNaN(q) || q <= 0) return null;
    const rule = conversions.find((c) => c.fromUOMId === calcFromUomId);
    if (!rule) return null;
    const toUom = uoms.find((u) => u.id === rule.toUOMId);
    const convertedTotal = Math.round(q * rule.conversionFactor * 100) / 100;
    return {
      convertedTotal,
      toName: toUom?.nameHi || toUom?.code || rule.toUOMCode,
      fromName: uoms.find((u) => u.id === calcFromUomId)?.nameHi,
    };
  }, [calcQty, calcFromUomId, conversions, uoms]);

  // Distinct units that have conversions for quick filter chips
  const availableFilterUnits = useMemo(() => {
    const unitIdSet = new Set<string>();
    conversions.forEach((c) => {
      unitIdSet.add(c.fromUOMId);
    });
    return uoms.filter((u) => unitIdSet.has(u.id));
  }, [conversions, uoms]);

  // Search & Filter Memo for main list
  const filteredConversions = useMemo(() => {
    const q = search.toLowerCase().trim();
    return conversions.filter((c) => {
      const fromUom = uoms.find((u) => u.id === c.fromUOMId);
      const toUom = uoms.find((u) => u.id === c.toUOMId);

      const matchSearch =
        !q ||
        (c.fromUOMCode && c.fromUOMCode.toLowerCase().includes(q)) ||
        (c.toUOMCode && c.toUOMCode.toLowerCase().includes(q)) ||
        (fromUom?.nameHi && fromUom.nameHi.toLowerCase().includes(q)) ||
        (fromUom?.nameEn && fromUom.nameEn.toLowerCase().includes(q)) ||
        (toUom?.nameHi && toUom.nameHi.toLowerCase().includes(q)) ||
        (toUom?.nameEn && toUom.nameEn.toLowerCase().includes(q)) ||
        (c.description && c.description.toLowerCase().includes(q)) ||
        (c.productName && c.productName.toLowerCase().includes(q));

      const matchUnit =
        selectedUnitFilter === 'ALL' ||
        c.fromUOMId === selectedUnitFilter ||
        c.toUOMId === selectedUnitFilter;

      return matchSearch && matchUnit;
    });
  }, [conversions, uoms, search, selectedUnitFilter]);

  // Units filtered inside the In-Modal Searchable Dropdown
  const filteredModalUoms = useMemo(() => {
    const q = modalDropdownSearch.toLowerCase().trim();
    if (!q) return uoms;
    return uoms.filter(
      (u) =>
        u.nameHi.toLowerCase().includes(q) ||
        u.nameEn.toLowerCase().includes(q) ||
        u.code.toLowerCase().includes(q) ||
        (u.category && u.category.toLowerCase().includes(q))
    );
  }, [uoms, modalDropdownSearch]);

  // Units filtered inside the Calculator Dropdown
  const filteredCalcUoms = useMemo(() => {
    const q = calcDropdownSearch.toLowerCase().trim();
    if (!q) return availableFilterUnits;
    return availableFilterUnits.filter(
      (u) =>
        u.nameHi.toLowerCase().includes(q) ||
        u.nameEn.toLowerCase().includes(q) ||
        u.code.toLowerCase().includes(q)
    );
  }, [availableFilterUnits, calcDropdownSearch]);

  const activeFromUom = uoms.find((u) => u.id === fromUomId);
  const activeToUom = uoms.find((u) => u.id === toUomId);

  // High-density, compact conversion item
  const renderConversionItem = ({ item }: { item: UnitConversion }) => {
    const fromUom = uoms.find((u) => u.id === item.fromUOMId);
    const toUom = uoms.find((u) => u.id === item.toUOMId);

    return (
      <Card style={styles.compactCard}>
        {/* Row 1: Formula Strip & Action Buttons */}
        <View style={styles.compactMainRow}>
          <View style={styles.compactFormulaWrap}>
            {/* From Unit Pill */}
            <View style={styles.fromUnitPill}>
              <Text style={styles.fromUnitText}>
                1 {fromUom?.nameHi || item.fromUOMCode}
              </Text>
            </View>

            {/* Factor Arrow Pill */}
            <View style={styles.factorArrowPill}>
              <Text style={styles.factorArrowText}>× {item.conversionFactor}</Text>
              <Ionicons name="arrow-forward" size={13} color="#D97706" />
            </View>

            {/* To Unit Pill */}
            <View style={styles.toUnitPill}>
              <Text style={styles.toUnitText}>
                {item.conversionFactor} {toUom?.nameHi || item.toUOMCode}
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              onPress={() => handleOpenEditModal(item)}
              style={styles.editBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="create-outline" size={15} color={Colors.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleDelete(item)}
              style={styles.deleteBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={15} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Row 2: Description and Tag */}
        <View style={styles.compactSubRow}>
          <Text style={styles.descText} numberOfLines={1}>
            {item.description}
          </Text>
          {item.productName ? (
            <View style={styles.productTag}>
              <Ionicons name="pricetag" size={10} color="#1E3A8A" />
              <Text style={styles.productTagText} numberOfLines={1}>
                {item.productName}
              </Text>
            </View>
          ) : (
            <Text style={styles.globalTag}>
              {language === 'hi' ? 'मानक (Global)' : 'Standard'}
            </Text>
          )}
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.screen}>
      <Header
        title={language === 'hi' ? 'इकाई रूपांतरण (Conversion)' : 'Unit Conversions'}
        subtitle={language === 'hi' ? 'पेटी, बोरी व नग का सटीक अनुपात' : 'Pack Size & Unit Mapping Rules'}
        showBack={true}
      />

      {/* 1. Ultra-Slim Single-Line Live Calculator Strip */}
      <View style={styles.singleLineCalcContainer}>
        <View style={styles.singleLineCalcBar}>
          <Ionicons name="calculator" size={15} color="#D97706" style={{ marginRight: 4 }} />

          {/* Inline Qty Input */}
          <TextInput
            style={styles.calcInputInline}
            placeholder="5"
            placeholderTextColor="#94A3B8"
            keyboardType="numeric"
            value={calcQty}
            onChangeText={setCalcQty}
            selectTextOnFocus
          />

          {/* From Unit Selector Pill (Opens Inline Dropdown) */}
          <TouchableOpacity
            style={[styles.calcUnitPill, calcDropdownOpen && styles.calcUnitPillActive]}
            onPress={() => {
              setCalcDropdownSearch('');
              setCalcDropdownOpen(!calcDropdownOpen);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.calcUnitPillText} numberOfLines={1}>
              {uoms.find((u) => u.id === calcFromUomId)?.nameHi || 'इकाई'}
            </Text>
            <Ionicons name={calcDropdownOpen ? 'chevron-up' : 'chevron-down'} size={11} color="#92400E" />
          </TouchableOpacity>

          {/* Thin arrow */}
          <Ionicons name="arrow-forward" size={13} color="#D97706" style={{ marginHorizontal: 3 }} />

          {/* Live Single Line Result */}
          <View style={styles.calcResultInline}>
            {calcResult ? (
              <Text style={styles.calcResultInlineText} numberOfLines={1}>
                ={' '}
                <Text style={styles.calcResultInlineBold}>{calcResult.convertedTotal}</Text>{' '}
                {calcResult.toName}
              </Text>
            ) : (
              <Text style={styles.calcNoRuleText} numberOfLines={1}>
                {language === 'hi' ? 'नियम नहीं' : 'No rule'}
              </Text>
            )}
          </View>
        </View>

        {/* Inline Calculator Dropdown */}
        {calcDropdownOpen && (
          <View style={styles.calcDropdownCard}>
            <View style={styles.inlineSearchWrap}>
              <Ionicons name="search" size={14} color={Colors.textSecondary} style={{ marginRight: 6 }} />
              <TextInput
                style={styles.inlineSearchInput}
                placeholder={language === 'hi' ? 'इकाई खोजें...' : 'Search unit...'}
                placeholderTextColor="#94A3B8"
                value={calcDropdownSearch}
                onChangeText={setCalcDropdownSearch}
              />
              {calcDropdownSearch ? (
                <TouchableOpacity onPress={() => setCalcDropdownSearch('')}>
                  <Ionicons name="close" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {filteredCalcUoms.map((u) => {
                const isSel = calcFromUomId === u.id;
                return (
                  <TouchableOpacity
                    key={u.id}
                    style={[styles.inlineItemRow, isSel && styles.inlineItemRowActive]}
                    onPress={() => {
                      setCalcFromUomId(u.id);
                      setCalcDropdownOpen(false);
                      setCalcDropdownSearch('');
                    }}
                  >
                    <Text style={[styles.inlineItemName, isSel && styles.inlineItemNameActive]}>
                      {u.nameHi} ({u.code})
                    </Text>
                    {isSel && <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>

      {/* 2. Fast Real-Time Search Bar */}
      <View style={styles.searchBarContainer}>
        <Input
          placeholder={
            language === 'hi'
              ? 'इकाई या नियम खोजें (उदा. पेटी, बोतल, BOX, PC)...'
              : 'Search units or rules (e.g. Box, Bottle)...'
          }
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

      {/* 3. Quick Unit Filter Chips (Horizontal) */}
      {availableFilterUnits.length > 0 && (
        <View style={styles.filterChipsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsScroll}>
            <TouchableOpacity
              style={[styles.filterChip, selectedUnitFilter === 'ALL' && styles.filterChipActive]}
              onPress={() => setSelectedUnitFilter('ALL')}
            >
              <Text style={[styles.filterChipText, selectedUnitFilter === 'ALL' && styles.filterChipTextActive]}>
                {language === 'hi' ? 'सभी' : 'All'} ({conversions.length})
              </Text>
            </TouchableOpacity>

            {availableFilterUnits.map((u) => {
              const isSel = selectedUnitFilter === u.id;
              const ruleCount = conversions.filter((c) => c.fromUOMId === u.id || c.toUOMId === u.id).length;
              return (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.filterChip, isSel && styles.filterChipActive]}
                  onPress={() => setSelectedUnitFilter(isSel ? 'ALL' : u.id)}
                >
                  <Text style={[styles.filterChipText, isSel && styles.filterChipTextActive]}>
                    {u.nameHi} ({ruleCount})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* 4. Compact Conversions List (Shows maximum items per screen) */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>{language === 'hi' ? 'लोड हो रहा है...' : 'Loading...'}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredConversions}
          keyExtractor={(item) => item.id}
          renderItem={renderConversionItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 85 }]}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="swap-horizontal" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {search || selectedUnitFilter !== 'ALL'
                  ? language === 'hi'
                    ? 'खोज के अनुसार कोई नियम नहीं मिला'
                    : 'No matching conversion rules'
                  : language === 'hi'
                  ? 'कोई रूपांतरण नियम नहीं'
                  : 'No conversion rules yet'}
              </Text>
              <Text style={styles.emptySub}>
                {search || selectedUnitFilter !== 'ALL'
                  ? language === 'hi'
                    ? 'कृपया अन्य इकाई का नाम खोजें या फ़िल्टर हटाएं।'
                    : 'Try another keyword or clear filters.'
                  : language === 'hi'
                  ? 'नीचे दिए गए बटन से नया नियम (उदा. 1 पेटी = 10 नग) जोड़ें।'
                  : 'Add a conversion rule using the button below.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Floating Add Rule Button */}
      <TouchableOpacity
        style={[styles.fab, { bottom: Math.max(insets.bottom, 16) + 16 }]}
        onPress={handleOpenAddModal}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={22} color="#FFFFFF" />
        <Text style={styles.fabText}>{language === 'hi' ? 'नया नियम' : 'Add Rule'}</Text>
      </TouchableOpacity>

      {/* Add / Edit Conversion Modal (Searchable Dropdowns are INLINE, guaranteed in front!) */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setModalDropdown(null);
          setModalVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingConversion
                  ? language === 'hi'
                    ? 'रूपांतरण नियम सुधारें (Edit Rule)'
                    : 'Edit Conversion Rule'
                  : language === 'hi'
                  ? 'नया इकाई रूपांतरण नियम'
                  : 'New Conversion Rule'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setModalDropdown(null);
                  setModalVisible(false);
                }}
              >
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 460 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Step 1: From Unit Searchable Dropdown */}
              <Text style={styles.inputLabel}>
                {language === 'hi' ? '1. बड़ी पैकेजिंग इकाई (From Unit) *' : '1. From Unit (Larger Unit) *'}
              </Text>

              <TouchableOpacity
                style={[
                  styles.dropdownSelector,
                  modalDropdown === 'from' && styles.dropdownSelectorActive,
                ]}
                onPress={() => {
                  setModalDropdownSearch('');
                  setModalDropdown(modalDropdown === 'from' ? null : 'from');
                }}
                activeOpacity={0.7}
              >
                <View style={styles.dropdownSelectedWrap}>
                  <Ionicons name="cube-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
                  {activeFromUom ? (
                    <Text style={styles.dropdownSelectedText}>
                      {activeFromUom.nameHi} ({activeFromUom.code}) - {activeFromUom.nameEn}
                    </Text>
                  ) : (
                    <Text style={styles.dropdownPlaceholderText}>
                      {language === 'hi' ? 'बड़ी इकाई चुनें...' : 'Select larger unit...'}
                    </Text>
                  )}
                </View>
                <Ionicons
                  name={modalDropdown === 'from' ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={modalDropdown === 'from' ? Colors.primary : Colors.textSecondary}
                />
              </TouchableOpacity>

              {/* Inline Searchable Dropdown for From Unit */}
              {modalDropdown === 'from' && (
                <View style={styles.inlineDropdownCard}>
                  <View style={styles.inlineSearchWrap}>
                    <Ionicons name="search" size={15} color={Colors.textSecondary} style={{ marginRight: 6 }} />
                    <TextInput
                      style={styles.inlineSearchInput}
                      placeholder={
                        language === 'hi'
                          ? 'इकाई खोजें (उदा. पेटी, बोरी, BOX, KG)...'
                          : 'Search unit name or code...'
                      }
                      placeholderTextColor="#94A3B8"
                      value={modalDropdownSearch}
                      onChangeText={setModalDropdownSearch}
                      autoFocus
                    />
                    {modalDropdownSearch ? (
                      <TouchableOpacity onPress={() => setModalDropdownSearch('')}>
                        <Ionicons name="close" size={16} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <ScrollView
                    style={{ maxHeight: 180 }}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                  >
                    {filteredModalUoms.length === 0 ? (
                      <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: Colors.textMuted }}>
                          {language === 'hi' ? 'कोई इकाई नहीं मिली' : 'No units match'}
                        </Text>
                      </View>
                    ) : (
                      filteredModalUoms.map((u) => {
                        const isSel = fromUomId === u.id;
                        return (
                          <TouchableOpacity
                            key={u.id}
                            style={[styles.inlineItemRow, isSel && styles.inlineItemRowActive]}
                            onPress={() => {
                              setFromUomId(u.id);
                              setModalDropdown(null);
                              setModalDropdownSearch('');
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.inlineItemName, isSel && styles.inlineItemNameActive]}>
                                {u.nameHi} ({u.code})
                              </Text>
                              <Text style={styles.inlineItemSub}>
                                {u.nameEn} • {u.category || 'इकाई'}
                              </Text>
                            </View>
                            {isSel && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              )}

              {/* Step 2: Conversion Factor */}
              <Input
                label={
                  language === 'hi'
                    ? '2. इसमें कितनी छोटी इकाइयाँ होंगी? (संख्या) *'
                    : '2. How many base units in 1 package? *'
                }
                placeholder="10, 20, 50, 1000..."
                keyboardType="numeric"
                value={factor}
                onChangeText={setFactor}
              />

              {/* Step 3: To Unit Searchable Dropdown */}
              <Text style={styles.inputLabel}>
                {language === 'hi' ? '3. छोटी / बेस इकाई (To Unit) *' : '3. To Unit (Base Unit) *'}
              </Text>

              <TouchableOpacity
                style={[
                  styles.dropdownSelector,
                  styles.dropdownSelectorGreen,
                  modalDropdown === 'to' && styles.dropdownSelectorActiveGreen,
                ]}
                onPress={() => {
                  setModalDropdownSearch('');
                  setModalDropdown(modalDropdown === 'to' ? null : 'to');
                }}
                activeOpacity={0.7}
              >
                <View style={styles.dropdownSelectedWrap}>
                  <Ionicons name="scale-outline" size={18} color="#15803D" style={{ marginRight: 8 }} />
                  {activeToUom ? (
                    <Text style={[styles.dropdownSelectedText, { color: '#15803D' }]}>
                      {activeToUom.nameHi} ({activeToUom.code}) - {activeToUom.nameEn}
                    </Text>
                  ) : (
                    <Text style={styles.dropdownPlaceholderText}>
                      {language === 'hi' ? 'छोटी इकाई चुनें...' : 'Select base unit...'}
                    </Text>
                  )}
                </View>
                <Ionicons
                  name={modalDropdown === 'to' ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#15803D"
                />
              </TouchableOpacity>

              {/* Inline Searchable Dropdown for To Unit */}
              {modalDropdown === 'to' && (
                <View style={[styles.inlineDropdownCard, styles.inlineDropdownCardGreen]}>
                  <View style={styles.inlineSearchWrap}>
                    <Ionicons name="search" size={15} color={Colors.textSecondary} style={{ marginRight: 6 }} />
                    <TextInput
                      style={styles.inlineSearchInput}
                      placeholder={
                        language === 'hi'
                          ? 'इकाई खोजें (उदा. बोतल, नग, PC, ML, KG)...'
                          : 'Search base unit...'
                      }
                      placeholderTextColor="#94A3B8"
                      value={modalDropdownSearch}
                      onChangeText={setModalDropdownSearch}
                      autoFocus
                    />
                    {modalDropdownSearch ? (
                      <TouchableOpacity onPress={() => setModalDropdownSearch('')}>
                        <Ionicons name="close" size={16} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <ScrollView
                    style={{ maxHeight: 180 }}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                  >
                    {filteredModalUoms.length === 0 ? (
                      <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: Colors.textMuted }}>
                          {language === 'hi' ? 'कोई इकाई नहीं मिली' : 'No units match'}
                        </Text>
                      </View>
                    ) : (
                      filteredModalUoms.map((u) => {
                        const isSel = toUomId === u.id;
                        return (
                          <TouchableOpacity
                            key={u.id}
                            style={[styles.inlineItemRow, isSel && styles.inlineItemRowActiveGreen]}
                            onPress={() => {
                              setToUomId(u.id);
                              setModalDropdown(null);
                              setModalDropdownSearch('');
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.inlineItemName, isSel && { color: '#15803D' }]}>
                                {u.nameHi} ({u.code})
                              </Text>
                              <Text style={styles.inlineItemSub}>
                                {u.nameEn} • {u.category || 'इकाई'}
                              </Text>
                            </View>
                            {isSel && <Ionicons name="checkmark-circle" size={18} color="#15803D" />}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              )}

              {/* Visual Formula Preview in Modal */}
              <View style={styles.formulaPreviewBox}>
                <Text style={styles.formulaPreviewTitle}>
                  {language === 'hi' ? 'रूपांतरण नियम का पूर्वावलोकन (Preview):' : 'Rule Preview:'}
                </Text>
                <Text style={styles.formulaPreviewFormula}>
                  1 {activeFromUom?.nameHi || 'बड़ी इकाई'} = {factor || '0'}{' '}
                  {activeToUom?.nameHi || 'छोटी इकाई'}
                </Text>
              </View>

              <Input
                label={language === 'hi' ? 'विवरण (वैकल्पिक / Notes):' : 'Description (Optional)'}
                placeholder="उदा. 1 पेटी = 10 पैकेट"
                value={description}
                onChangeText={setDescription}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title={language === 'hi' ? 'रद्द करें' : 'Cancel'}
                variant="outline"
                onPress={() => {
                  setModalDropdown(null);
                  setModalVisible(false);
                }}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title={
                  editingConversion
                    ? language === 'hi'
                      ? 'परिवर्तन सुरक्षित करें'
                      : 'Update Rule'
                    : language === 'hi'
                    ? 'नियम बनाएं'
                    : 'Save Rule'
                }
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
  // Single-Line Ultra-Slim Calculator Bar
  singleLineCalcContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  singleLineCalcBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 10,
    height: 38,
  },
  calcInputInline: {
    width: 38,
    height: 28,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: BorderRadius.sm,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
    padding: 0,
    marginRight: 6,
  },
  calcUnitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    gap: 3,
    maxWidth: 100,
  },
  calcUnitPillActive: {
    backgroundColor: '#FDE68A',
    borderColor: '#D97706',
    borderWidth: 1,
  },
  calcUnitPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  calcResultInline: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 6,
  },
  calcResultInlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
  },
  calcResultInlineBold: {
    fontSize: 15,
    fontWeight: '800',
    color: '#B45309',
  },
  calcNoRuleText: {
    fontSize: 11,
    color: '#B45309',
    fontStyle: 'italic',
  },
  calcDropdownCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: BorderRadius.md,
    padding: 8,
    marginTop: 4,
    elevation: 4,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },

  // Search Bar
  searchBarContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },

  // Filter Chips Row
  filterChipsRow: {
    paddingVertical: 4,
  },
  filterChipsScroll: {
    paddingHorizontal: 16,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Compact List
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  compactCard: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  compactMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactFormulaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexWrap: 'nowrap',
  },
  fromUnitPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  fromUnitText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  factorArrowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginHorizontal: 5,
    gap: 3,
  },
  factorArrowText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  toUnitPill: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  toUnitText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  editBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  descText: {
    fontSize: 11,
    color: Colors.textSecondary,
    flex: 1,
    marginRight: 6,
  },
  globalTag: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  productTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  productTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1E3A8A',
  },

  // Dropdown Selector Trigger Input
  dropdownSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  dropdownSelectorActive: {
    borderColor: Colors.primary,
    backgroundColor: '#EEF2FF',
  },
  dropdownSelectorGreen: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  dropdownSelectorActiveGreen: {
    borderColor: '#15803D',
    backgroundColor: '#DCFCE7',
  },
  dropdownSelectedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  dropdownSelectedText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  dropdownPlaceholderText: {
    fontSize: 13,
    color: Colors.textMuted,
  },

  // Inline Dropdown Search & List Box (Directly in Modal Form)
  inlineDropdownCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: 8,
    marginBottom: 12,
    elevation: 3,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  inlineDropdownCardGreen: {
    borderColor: '#15803D',
    shadowColor: '#15803D',
  },
  inlineSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 8,
    height: 34,
    marginBottom: 6,
  },
  inlineSearchInput: {
    flex: 1,
    fontSize: 12,
    color: Colors.textPrimary,
    padding: 0,
  },
  inlineItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  inlineItemRowActive: {
    backgroundColor: '#EFF6FF',
    borderRadius: BorderRadius.sm,
  },
  inlineItemRowActiveGreen: {
    backgroundColor: '#F0FDF4',
    borderRadius: BorderRadius.sm,
  },
  inlineItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  inlineItemNameActive: {
    color: Colors.primary,
  },
  inlineItemSub: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },

  // Empty Box
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 3,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: Colors.textSecondary,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 28,
    elevation: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  fabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Add / Edit Modal
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
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  formulaPreviewBox: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    alignItems: 'center',
  },
  formulaPreviewTitle: {
    fontSize: 11,
    color: '#92400E',
    marginBottom: 2,
  },
  formulaPreviewFormula: {
    fontSize: 14,
    fontWeight: '800',
    color: '#78350F',
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 16,
  },
});
