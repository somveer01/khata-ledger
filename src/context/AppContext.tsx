import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Business, SupportedLanguage, AppUser } from '../types';
import { StorageService } from '../services/storage';
import { DataRepository } from '../services/db';
import { isFirebaseConfigured } from '../services/firebase';
import { AuthService } from '../services/auth';
import { AuthModal } from '../components/AuthModal';

interface AppContextType {
  business: Business | null;
  language: SupportedLanguage;
  isFirebaseActive: boolean;
  isSyncing: boolean;
  pendingSyncCount: number;

  // Authentication & Guest Mode
  user: AppUser | null;
  isGuest: boolean;
  isAuthenticated: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, pass: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (email: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  logout: () => Promise<void>;
  loginAsGuest: () => void;
  showAuthModal: (message?: string, onSuccess?: () => void) => void;
  hideAuthModal: () => void;
  guardAction: (action: () => void, promptMessage?: string) => void;

  dataVersion: number;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  updateBusiness: (business: Business) => Promise<void>;
  refreshAllData: () => Promise<void>;
  seedDemoData: () => Promise<void>;
  clearData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [dataVersion, setDataVersion] = useState<number>(0);
  const [business, setBusiness] = useState<Business | null>(null);
  const [language, setLang] = useState<SupportedLanguage>('hi'); // Default to Hindi as per rural retailer requirements
  const [isFirebaseActive] = useState<boolean>(isFirebaseConfigured());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);

  // Authentication States
  const [user, setUser] = useState<AppUser | null>(null);
  const [isGuest, setIsGuestState] = useState<boolean>(true);
  const [authModalVisible, setAuthModalVisible] = useState<boolean>(false);
  const [authPromptMessage, setAuthPromptMessage] = useState<string | undefined>(undefined);
  const [onAuthSuccessCallback, setOnAuthSuccessCallback] = useState<(() => void) | undefined>(undefined);

  const init = async () => {
    try {
      const savedLang = await StorageService.getLanguage();
      setLang(savedLang);

      // Initialize auth state
      const authState = await AuthService.initAuth();
      setUser(authState.user);
      setIsGuestState(authState.isGuest);

      let currentBiz = await StorageService.getCurrentBusiness();
      if (!currentBiz) {
        // Automatically initialize default business if first launch
        currentBiz = {
          id: 'biz_default_1',
          name: 'श्री गणेश खाद एवं बीज भण्डार',
          ownerName: 'रामेश्वर दयाल',
          phone: '9896012345',
          address: 'मुख्य बाजार, मण्डी गेट के पास',
          upiId: 'kisanagro@upi',
          currency: 'INR',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await StorageService.setCurrentBusiness(currentBiz);
        // Seed initial reference ledger data
        await DataRepository.seedDemoData(currentBiz.id);
      }
      setBusiness(currentBiz);
      const count = await StorageService.getPendingSyncCount(currentBiz.id);
      setPendingSyncCount(count);
    } catch (err) {
      console.error('AppProvider init error:', err);
    }
  };

  useEffect(() => {
    init();
  }, []);

  const changeLanguage = async (newLang: SupportedLanguage) => {
    setLang(newLang);
    await StorageService.setLanguage(newLang);
  };

  const updateBusiness = async (newBiz: Business) => {
    setBusiness(newBiz);
    await DataRepository.saveBusiness(newBiz);
  };

  const refreshAllData = async () => {
    setDataVersion((v) => v + 1);
    if (business) {
      setIsSyncing(true);
      const count = await StorageService.getPendingSyncCount(business.id);
      setPendingSyncCount(count);
      setIsSyncing(false);
    }
  };

  const seedDemoData = async () => {
    if (business) {
      setIsSyncing(true);
      await DataRepository.seedDemoData(business.id);
      await refreshAllData();
      setIsSyncing(false);
    }
  };

  const clearData = async () => {
    if (business) {
      setIsSyncing(true);
      await DataRepository.clearAllData(business.id);
      await refreshAllData();
      setIsSyncing(false);
    }
  };

  // Auth Operations
  const login = async (email: string, pass: string) => {
    const res = await AuthService.login(email, pass);
    if (res.success && res.user) {
      setUser(res.user);
      setIsGuestState(false);
    }
    return res;
  };

  const register = async (email: string, pass: string, name?: string) => {
    const res = await AuthService.register(email, pass, name);
    if (res.success && res.user) {
      setUser(res.user);
      setIsGuestState(false);
    }
    return res;
  };

  const resetPassword = async (email: string) => {
    return await AuthService.resetPassword(email);
  };

  const logout = async () => {
    await AuthService.logout();
    setUser(null);
    setIsGuestState(true);
  };

  const loginAsGuest = async () => {
    await AuthService.loginAsGuest();
    setUser(null);
    setIsGuestState(true);
  };

  const showAuthModal = (message?: string, onSuccess?: () => void) => {
    setAuthPromptMessage(message);
    setOnAuthSuccessCallback(() => onSuccess);
    setAuthModalVisible(true);
  };

  const hideAuthModal = () => {
    setAuthModalVisible(false);
    setAuthPromptMessage(undefined);
    setOnAuthSuccessCallback(undefined);
  };

  const guardAction = (action: () => void, promptMessage?: string) => {
    if (user && !isGuest) {
      action();
    } else {
      showAuthModal(
        promptMessage || (language === 'hi' ? 'प्रविष्टि करने के लिए कृपया लॉगिन करें' : 'Please login or register to add entries'),
        action
      );
    }
  };

  return (
    <AppContext.Provider
      value={{
        business,
        language,
        isFirebaseActive,
        isSyncing,
        pendingSyncCount,
        user,
        isGuest,
        isAuthenticated: !!user && !isGuest,
        login,
        register,
        resetPassword,
        logout,
        loginAsGuest,
        showAuthModal,
        hideAuthModal,
        guardAction,
        dataVersion,
        setLanguage: changeLanguage,
        updateBusiness,
        refreshAllData,
        seedDemoData,
        clearData,
      }}
    >
      {children}
      <AuthModal
        visible={authModalVisible}
        onClose={hideAuthModal}
        onSuccess={onAuthSuccessCallback}
        customMessage={authPromptMessage}
      />
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

