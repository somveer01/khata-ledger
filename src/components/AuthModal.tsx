import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';
import { Input } from './Input';
import { Button } from './Button';
import { useApp } from '../context/AppContext';
import { t } from '../i18n';

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  customMessage?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  visible,
  onClose,
  onSuccess,
  customMessage,
}) => {
  const { language, login, register, loginAsGuest } = useApp();
  const [tab, setTab] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Status states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setFullName('');
    setErrorMsg('');
    setLoading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleContinueAsGuest = () => {
    loginAsGuest();
    handleClose();
  };

  const handleSubmit = async () => {
    setErrorMsg('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMsg(t('invalidEmailError', language));
      return;
    }

    if (!password || password.length < 6) {
      setErrorMsg(t('passwordTooShortError', language));
      return;
    }

    if (tab === 'REGISTER') {
      if (password !== confirmPassword) {
        setErrorMsg(t('passwordsDoNotMatch', language));
        return;
      }
    }

    setLoading(true);

    if (tab === 'LOGIN') {
      const res = await login(trimmedEmail, password);
      setLoading(false);
      if (res.success) {
        resetForm();
        onClose();
        if (onSuccess) onSuccess();
      } else {
        setErrorMsg(res.error || 'Login failed');
      }
    } else {
      const res = await register(trimmedEmail, password, fullName.trim() || undefined);
      setLoading(false);
      if (res.success) {
        resetForm();
        onClose();
        if (onSuccess) onSuccess();
      } else {
        setErrorMsg(res.error || 'Registration failed');
      }
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleClose}
        />

        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Ionicons name="lock-closed" size={20} color={Colors.primary} />
              </View>
              <Text style={styles.headerTitle}>
                {tab === 'LOGIN' ? t('login', language) : t('register', language)}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Subtitle / Custom prompt message */}
          {customMessage ? (
            <View style={styles.promptBanner}>
              <Ionicons name="information-circle" size={16} color="#B45309" />
              <Text style={styles.promptText}>{customMessage}</Text>
            </View>
          ) : (
            <Text style={styles.subTitle}>
              {t('guestModeNotice', language)}
            </Text>
          )}

          {/* Tab Switcher: Login vs Register */}
          <View style={styles.tabsContainer}>
            <TouchableOpacity
              style={[styles.tabButton, tab === 'LOGIN' && styles.activeTabButton]}
              onPress={() => {
                setTab('LOGIN');
                setErrorMsg('');
              }}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  tab === 'LOGIN' && styles.activeTabButtonText,
                ]}
              >
                {t('loginTab', language)}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, tab === 'REGISTER' && styles.activeTabButton]}
              onPress={() => {
                setTab('REGISTER');
                setErrorMsg('');
              }}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  tab === 'REGISTER' && styles.activeTabButtonText,
                ]}
              >
                {t('registerTab', language)}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Error Message */}
          {errorMsg ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={Colors.creditSale} />
              <Text style={styles.errorBannerText}>{errorMsg}</Text>
            </View>
          ) : null}

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.formContainer}
          >
            {tab === 'REGISTER' ? (
              <Input
                label={t('fullName', language)}
                placeholder={t('fullNamePlaceholder', language)}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
              />
            ) : null}

            <Input
              label={t('email', language)}
              placeholder={t('emailPlaceholder', language)}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.passwordWrapper}>
              <Input
                label={t('password', language)}
                placeholder={t('passwordPlaceholder', language)}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={Colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {tab === 'REGISTER' ? (
              <Input
                label={t('confirmPassword', language)}
                placeholder={t('confirmPasswordPlaceholder', language)}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
            ) : null}

            {/* Primary Submit Button */}
            <Button
              title={tab === 'LOGIN' ? t('login', language) : t('register', language)}
              onPress={handleSubmit}
              loading={loading}
              variant="primary"
              size="lg"
              style={styles.submitBtn}
            />

            {/* Continue as Guest Button */}
            <TouchableOpacity
              style={styles.guestBtn}
              onPress={handleContinueAsGuest}
              activeOpacity={0.7}
            >
              <Ionicons name="person-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.guestBtnText}>{t('loginAsGuest', language)}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    padding: Spacing.lg,
    elevation: 8,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  subTitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  promptBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  promptText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
    flex: 1,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: BorderRadius.md,
    padding: 3,
    marginBottom: Spacing.md,
  },
  tabButton: {
    flex: 1,
    paddingVertical: Spacing.xs + 2,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  activeTabButton: {
    backgroundColor: Colors.surface,
    elevation: 2,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activeTabButtonText: {
    color: Colors.primary,
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  errorBannerText: {
    fontSize: 12,
    color: Colors.creditSale,
    fontWeight: '500',
    flex: 1,
  },
  formContainer: {
    paddingTop: Spacing.xs,
  },
  passwordWrapper: {
    position: 'relative',
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: 36,
  },
  submitBtn: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  guestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  guestBtnText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
