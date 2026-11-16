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
import { UnitOfMeasurement, UnitConversion } from '../../types';
import { showAlert, confirmAction } from '../../utils/dialog';
import { t } from '../../i18n';

export const UomConversionScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { business, language } = useApp();

  const [loading, setLoading] = useState(true);
  const [conversions, setConversions] = useState<UnitConversion[]>([]);
  const [uoms, setUoms] = useState<UnitOfMeasurement[]>([]);

  // Interactive Live Calculator widget
  const [calcQty, setCalcQty] = useState('5');
  const [calcFromUomId, setCalcFromUomId] = useState('uom_box');

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [fromUomId, setFromUomId] = useState('');
  const [toUomId, setToUomId] = useState('');
  const [factor, setFactor] = useState('10');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

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
    const boxUom = uoms.find((u) => u.code === 'BOX') || uoms[0];
    const pcUom = uoms.find((u) => u.code === 'PC') || uoms[1] || uoms[0];
    setFromUomId(boxUom ? boxUom.id : '');
    setToUomId(pcUom ? pcUom.id : '');
    setFactor('10');
    setDescription('');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!business) return;
    if (!fromUomId || !toUomId) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'कृपया दोनों इकाइयाँ चुनें।' : 'Please select both units.', undefined, 'danger');
      return;
    }
    if (fromUomId === toUomId) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'दोनों इकाइयाँ अलग-अलग होनी चाहिए।' : 'From and To units must be different.', undefined, 'danger');
      return;
    }
    const factorNum = parseFloat(factor);
    if (isNaN(factorNum) || factorNum <= 0) {
      showAlert(language === 'hi' ? 'त्रुटि' : 'Error', language === 'hi' ? 'कृपया सही संख्या (अनुपात) दर्ज करें।' : 'Please enter a valid conversion factor.', undefined, 'danger');
      return;
    }

    const fromUom = uoms.find((u) => u.id === fromUomId);
    const toUom = uoms.find((u) => u.id === toUomId);

    setSaving(true);
    try {
      const convId = `conv_${fromUom?.code.toLowerCase()}_${toUom?.code.toLowerCase()}_${Date.now()}`;
      const defaultDesc = `1 ${fromUom?.nameHi || fromUom?.code} = ${factorNum} ${toUom?.nameHi || toUom?.code}`;

      const newConv: UnitConversion = {
        id: convId,
        businessId: business.id,
        fromUOMId: fromUomId,
        fromUOMCode: fromUom?.code,
        toUOMId: toUomId,
        toUOMCode: toUom?.code,
        conversionFactor: factorNum,
        description: description.trim() || defaultDesc,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await DataRepository.saveUOMConversion(newConv);
      setModalVisible(false);
      await loadData();
      showAlert(language === 'hi' ? 'सफल' : 'Success', language === 'hi' ? 'रूपांतरण नियम सुरक्षित हो गया।' : 'Conversion rule saved successfully.', undefined, 'success');
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
      language === 'hi' ? `क्या आप निश्चित रूप से "${item.description || 'रूपांतरण'}" को हटाना चाहते हैं?` : 'Are you sure you want to delete this conversion rule?',
      async () => {
        const res = await DataRepository.deleteUOMConversion(business.id, item.id);
        if (res.success) {
          await loadData();
          showAlert(language === 'hi' ? 'सफल' : 'Success', language === 'hi' ? 'नियम हटा दिया गया।' : 'Rule deleted.', undefined, 'success');
        } else {
          showAlert(language === 'hi' ? 'त्रुटि' : 'Error', res.error || 'Failed to delete rule', undefined, 'danger');
        }
      },
      language === 'hi' ? 'हटाएं' : 'Delete',
      language === 'hi' ? 'रद्द करें' : 'Cancel',
      'danger'
    );
  };

  // Calculator computation
  const calcResult = useMemo(() => {
    const q = parseFloat(calcQty);
    if (isNaN(q) || q <= 0) return null;
    const rule = conversions.find((c) => c.fromUOMId === calcFromUomId);
    if (!rule) return null;
    const toUom = uoms.find((u) => u.id === rule.toUOMId);
    const convertedTotal = q * rule.conversionFactor;
    return {
      convertedTotal,
      toName: toUom?.nameHi || toUom?.code || rule.toUOMCode,
      fromName: uoms.find((u) => u.id === calcFromUomId)?.nameHi,
    };
  }, [calcQty, calcFromUomId, conversions, uoms]);

  const renderConversionItem = ({ item }: { item: UnitConversion }) => {
    const fromUom = uoms.find((u) => u.id === item.fromUOMId);
    const toUom = uoms.find((u) => u.id === item.toUOMId);

    return (
      <Card style={styles.convCard}>
        <View style={styles.ruleVisualRow}>
          <View style={styles.unitBox}>
            <Text style={styles.unitBoxCount}>1</Text>
            <Text style={styles.unitBoxCode}>{item.fromUOMCode || fromUom?.code}</Text>
            <Text style={styles.unitBoxName} numberOfLines={1}>
              {fromUom?.nameHi || fromUom?.nameEn}
            </Text>
          </View>

          <View style={styles.arrowBox}>
            <View style={styles.factorPill}>
              <Text style={styles.factorPillText}>× {item.conversionFactor}</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color="#D97706" />
          </View>

          <View style={[styles.unitBox, styles.unitBoxTo]}>
            <Text style={styles.unitBoxCount}>{item.conversionFactor}</Text>
            <Text style={[styles.unitBoxCode, { color: '#047857' }]}>{item.toUOMCode || toUom?.code}</Text>
            <Text style={styles.unitBoxName} numberOfLines={1}>
              {toUom?.nameHi || toUom?.nameEn}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={{ flex: 1 }}>
            <Text style={styles.descText}>{item.description}</Text>
            {item.productName ? (
              <View style={styles.productTag}>
                <Ionicons name="pricetag" size={10} color="#1E3A8A" />
                <Text style={styles.productTagText}>{item.productName}</Text>
              </View>
            ) : (
              <Text style={styles.globalTag}>
                {language === 'hi' ? 'मानक (Global Rule)' : 'Standard Global Rule'}
              </Text>
            )}
          </View>

          <TouchableOpacity
            onPress={() => handleDelete(item)}
            style={styles.deleteBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
          </TouchableOpacity>
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

      {/* Live Interactive Conversion Calculator Card */}
      <View style={styles.calcContainer}>
        <Card style={styles.calcCard}>
          <View style={styles.calcHeader}>
            <Ionicons name="calculator" size={18} color="#D97706" />
            <Text style={styles.calcTitle}>
              {language === 'hi' ? 'लाइव रूपांतरण कैलकुलेटर (Live Calculator)' : 'Live Conversion Preview'}
            </Text>
          </View>

          <View style={styles.calcRow}>
            <View style={{ width: 80 }}>
              <Input
                placeholder="5"
                keyboardType="numeric"
                value={calcQty}
                onChangeText={setCalcQty}
                style={{ textAlign: 'center', fontSize: 16, fontWeight: '700' }}
              />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fromUomPicker}>
              {conversions.map((c) => {
                const uom = uoms.find((u) => u.id === c.fromUOMId);
                const active = calcFromUomId === c.fromUOMId;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.uomChip, active && styles.uomChipActive]}
                    onPress={() => setCalcFromUomId(c.fromUOMId)}
                  >
                    <Text style={[styles.uomChipText, active && styles.uomChipTextActive]}>
                      {uom?.nameHi || c.fromUOMCode}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {calcResult && (
            <View style={styles.calcResultBox}>
              <Text style={styles.calcResultText}>
                = <Text style={styles.calcResultBold}>{calcResult.convertedTotal}</Text> {calcResult.toName}
              </Text>
              <Text style={styles.calcResultHint}>
                ({calcQty} {calcResult.fromName} में कुल {calcResult.convertedTotal} {calcResult.toName} होते हैं)
              </Text>
            </View>
          )}
        </Card>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>{language === 'hi' ? 'लोड हो रहा है...' : 'Loading...'}</Text>
        </View>
      ) : (
        <FlatList
          data={conversions}
          keyExtractor={(item) => item.id}
          renderItem={renderConversionItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="swap-horizontal" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {language === 'hi' ? 'कोई रूपांतरण नियम नहीं' : 'No conversion rules yet'}
              </Text>
              <Text style={styles.emptySub}>
                {language === 'hi' ? 'नीचे दिए गए बटन से नया नियम (उदा. 1 पेटी = 10 नग) जोड़ें।' : 'Add a conversion rule using the button below.'}
              </Text>
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
        <Text style={styles.fabText}>{language === 'hi' ? 'नया नियम' : 'Add Rule'}</Text>
      </TouchableOpacity>

      {/* Add Conversion Modal */}
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
                {language === 'hi' ? 'नया इकाई रूपांतरण नियम' : 'New Conversion Rule'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
              {/* Step 1: From Unit */}
              <Text style={styles.inputLabel}>
                {language === 'hi' ? '1. बड़ी पैकेजिंग इकाई चुनें (From Unit):' : '1. From Unit (Larger Unit):'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {uoms.map((u) => {
                  const active = fromUomId === u.id;
                  return (
                    <TouchableOpacity
                      key={u.id}
                      style={[styles.uomSelectChip, active && styles.uomSelectChipActive]}
                      onPress={() => setFromUomId(u.id)}
                    >
                      <Text style={[styles.uomSelectChipText, active && styles.uomSelectChipTextActive]}>
                        {u.nameHi} ({u.code})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Step 2: Conversion Factor */}
              <Input
                label={language === 'hi' ? '2. इसमें कितनी छोटी इकाइयाँ होंगी? (संख्या):' : '2. How many base units in 1 package?'}
                placeholder="10, 20, 50, 1000..."
                keyboardType="numeric"
                value={factor}
                onChangeText={setFactor}
              />

              {/* Step 3: To Unit */}
              <Text style={styles.inputLabel}>
                {language === 'hi' ? '3. छोटी / बेस इकाई चुनें (To Unit):' : '3. To Unit (Base Unit):'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {uoms.map((u) => {
                  const active = toUomId === u.id;
                  return (
                    <TouchableOpacity
                      key={u.id}
                      style={[styles.uomSelectChip, active && styles.uomSelectChipActiveGreen]}
                      onPress={() => setToUomId(u.id)}
                    >
                      <Text style={[styles.uomSelectChipText, active && styles.uomSelectChipTextActive]}>
                        {u.nameHi} ({u.code})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Visual Formula Preview in Modal */}
              <View style={styles.formulaPreviewBox}>
                <Text style={styles.formulaPreviewTitle}>
                  {language === 'hi' ? 'रूपांतरण नियम का पूर्वावलोकन (Preview):' : 'Rule Preview:'}
                </Text>
                <Text style={styles.formulaPreviewFormula}>
                  1 {uoms.find((u) => u.id === fromUomId)?.nameHi || 'इकाई'} = {factor || '0'} {uoms.find((u) => u.id === toUomId)?.nameHi || 'इकाई'}
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
                onPress={() => setModalVisible(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title={language === 'hi' ? 'नियम बनाएं' : 'Save Rule'}
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
  calcContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    marginBottom: 6,
  },
  calcCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    padding: 14,
    borderRadius: 14,
  },
  calcHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  calcTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  calcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fromUomPicker: {
    flex: 1,
  },
  uomChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginRight: 6,
  },
  uomChipActive: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  uomChipText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
  },
  uomChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  calcResultBox: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#FEF3C7',
  },
  calcResultText: {
    fontSize: 16,
    color: '#92400E',
    fontWeight: '600',
  },
  calcResultBold: {
    fontSize: 18,
    fontWeight: '800',
    color: '#B45309',
  },
  calcResultHint: {
    fontSize: 11,
    color: '#78350F',
    marginTop: 2,
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
    paddingTop: 6,
  },
  convCard: {
    padding: 14,
    marginBottom: 10,
    borderRadius: 14,
  },
  ruleVisualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  unitBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  unitBoxTo: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  unitBoxCount: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primary,
  },
  unitBoxCode: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  unitBoxName: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  arrowBox: {
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factorPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginBottom: 4,
  },
  factorPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
  },
  descText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  globalTag: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  productTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  productTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
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
    textAlign: 'center',
    paddingHorizontal: 20,
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
    marginBottom: 8,
  },
  uomSelectChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  uomSelectChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  uomSelectChipActiveGreen: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  uomSelectChipText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  uomSelectChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  formulaPreviewBox: {
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  formulaPreviewTitle: {
    fontSize: 11,
    color: '#1E3A8A',
    fontWeight: '600',
  },
  formulaPreviewFormula: {
    fontSize: 15,
    color: '#1E3A8A',
    fontWeight: '800',
    marginTop: 2,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 10,
  },
});
