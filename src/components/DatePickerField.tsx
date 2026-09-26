import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing, Typography } from '../constants/theme';
import { formatUpperDate, getTodayIST, isToday } from '../utils/date';
import { format } from 'date-fns';

interface DatePickerFieldProps {
  label?: string;
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  helperText?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

const daysOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const DatePickerField: React.FC<DatePickerFieldProps> = ({
  label,
  value,
  onChange,
  helperText,
  containerStyle,
}) => {
  const [modalVisible, setModalVisible] = useState(false);

  // Initialize view year & month from value or today
  const [viewYear, setViewYear] = useState<number>(() => {
    try {
      const parts = value.split('-');
      return parts.length === 3 ? parseInt(parts[0], 10) : new Date().getFullYear();
    } catch {
      return new Date().getFullYear();
    }
  });

  const [viewMonth, setViewMonth] = useState<number>(() => {
    try {
      const parts = value.split('-');
      return parts.length === 3 ? parseInt(parts[1], 10) - 1 : new Date().getMonth();
    } catch {
      return new Date().getMonth();
    }
  });

  const todayStr = getTodayIST();

  const openPicker = () => {
    try {
      const parts = value.split('-');
      if (parts.length === 3) {
        setViewYear(parseInt(parts[0], 10));
        setViewMonth(parseInt(parts[1], 10) - 1);
      }
    } catch {
      // fallback
    }
    setModalVisible(true);
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d);
    }
    return days;
  }, [viewYear, viewMonth]);

  const selectDay = (day: number) => {
    const formatted = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(formatted);
    setModalVisible(false);
  };

  const selectToday = () => {
    onChange(todayStr);
    setModalVisible(false);
  };

  const selectYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    onChange(format(d, 'yyyy-MM-dd'));
    setModalVisible(false);
  };

  const isCurrentValueToday = isToday(value);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}

      {/* Touchable Input Box */}
      <TouchableOpacity
        style={styles.fieldWrapper}
        activeOpacity={0.8}
        onPress={openPicker}
      >
        <Ionicons name="calendar" size={18} color={Colors.primary} style={styles.leadingIcon} />
        <Text style={styles.valueText}>
          {formatUpperDate(value)}
          {isCurrentValueToday ? ' (Today)' : ''}
        </Text>
        <View style={styles.calendarBadge}>
          <Text style={styles.calendarBadgeText}>Change</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.primary} />
        </View>
      </TouchableOpacity>

      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}

      {/* Calendar Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.calendarCard}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalSubTitle}>{label || 'Select Date'}</Text>
                <Text style={styles.modalDateTitle}>{formatUpperDate(value)}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Quick Short Cuts */}
            <View style={styles.shortcutsRow}>
              <TouchableOpacity style={styles.shortcutBtn} onPress={selectToday}>
                <Text style={styles.shortcutBtnText}>Today ({formatUpperDate(todayStr)})</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shortcutBtn} onPress={selectYesterday}>
                <Text style={styles.shortcutBtnText}>Yesterday</Text>
              </TouchableOpacity>
            </View>

            {/* Month / Year Bar */}
            <View style={styles.navRow}>
              <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
                <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.monthYearText}>
                {monthNames[viewMonth]} {viewYear}
              </Text>
              <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
                <Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Weekdays */}
            <View style={styles.weekRow}>
              {daysOfWeek.map((day) => (
                <Text key={day} style={styles.weekDayText}>
                  {day}
                </Text>
              ))}
            </View>

            {/* Days Grid */}
            <View style={styles.daysGrid}>
              {calendarDays.map((day, idx) => {
                if (day === null) {
                  return <View key={`empty-${idx}`} style={styles.dayEmpty} />;
                }
                const formattedThisCell = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isSelected = formattedThisCell === value;
                const isTodayCell = formattedThisCell === todayStr;

                return (
                  <TouchableOpacity
                    key={`d-${day}`}
                    style={[
                      styles.dayCell,
                      isSelected && styles.daySelected,
                      isTodayCell && !isSelected && styles.dayToday,
                    ]}
                    onPress={() => selectDay(day)}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        isSelected && styles.daySelectedText,
                        isTodayCell && !isSelected && styles.dayTodayText,
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Done Button */}
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.doneBtnText}>Confirm Date</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  fieldWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    borderRadius: BorderRadius.md,
    backgroundColor: '#F0F9FF',
    paddingHorizontal: Spacing.md,
    height: 48,
  },
  leadingIcon: {
    marginRight: Spacing.sm,
  },
  valueText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  calendarBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DBEAFE',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.full,
    gap: 3,
  },
  calendarBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  helperText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  calendarCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  modalSubTitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  modalDateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primary,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: '#F1F5F9',
  },
  shortcutsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.md,
    marginTop: Spacing.xs,
  },
  shortcutBtn: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  shortcutBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.md,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  navBtn: {
    padding: 6,
  },
  monthYearText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 6,
  },
  weekDayText: {
    width: 36,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.sm,
    marginVertical: 2,
  },
  dayEmpty: {
    width: `${100 / 7}%`,
    height: 38,
  },
  daySelected: {
    backgroundColor: Colors.primary,
  },
  dayToday: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  daySelectedText: {
    color: Colors.textInverse,
    fontWeight: '800',
  },
  dayTodayText: {
    color: Colors.primary,
    fontWeight: '800',
  },
  doneBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  doneBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textInverse,
  },
});
