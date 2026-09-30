import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { SecurityService } from '../services/security';

interface SecurityContextType {
  isLocked: boolean;
  isMpinEnabled: boolean;
  isMpinConfigured: boolean;
  autoLockTimeout: number; // in seconds, default 30
  cooldownSeconds: number;
  isLoading: boolean;
  unlock: (pin: string) => Promise<{ success: boolean; cooldownRemaining?: number; remainingAttempts?: number }>;
  lockApp: () => void;
  setNewMpin: (pin: string) => Promise<boolean>;
  changeMpin: (oldPin: string, newPin: string) => Promise<{ success: boolean; error?: string }>;
  disableMpin: (currentPin: string) => Promise<{ success: boolean; error?: string }>;
  resetMpin: () => Promise<void>;
  updateAutoLockTimeout: (seconds: number) => Promise<void>;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

export const SecurityProvider = ({ children }: { children: ReactNode }) => {
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isMpinEnabled, setIsMpinEnabled] = useState<boolean>(false);
  const [isMpinConfigured, setIsMpinConfigured] = useState<boolean>(false);
  const [autoLockTimeout, setAutoLockTimeoutState] = useState<number>(30); // 30 seconds
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const lastBackgroundedTime = useRef<number | null>(null);
  const autoLockTimeoutRef = useRef<number>(30);
  const isMpinEnabledRef = useRef<boolean>(false);

  // Sync refs for event listeners
  useEffect(() => {
    autoLockTimeoutRef.current = autoLockTimeout;
  }, [autoLockTimeout]);

  useEffect(() => {
    isMpinEnabledRef.current = isMpinEnabled;
  }, [isMpinEnabled]);

  // Initial load
  useEffect(() => {
    const initSecurity = async () => {
      try {
        const [enabled, configured, timeout, cooldown] = await Promise.all([
          SecurityService.isMpinEnabled(),
          SecurityService.isMpinConfigured(),
          SecurityService.getAutoLockTimeout(),
          SecurityService.getCooldownRemaining(),
        ]);

        setIsMpinEnabled(enabled);
        setIsMpinConfigured(configured);
        setAutoLockTimeoutState(timeout);
        setCooldownSeconds(cooldown);

        // If MPIN is enabled, lock on initial app launch (cold boot)
        if (enabled) {
          setIsLocked(true);
        }
      } catch (e) {
        console.error('Error initializing security:', e);
      } finally {
        setIsLoading(false);
      }
    };

    initSecurity();
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  // Handle App Lifecycle: background -> active transitions
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        lastBackgroundedTime.current = Date.now();
      } else if (nextAppState === 'active') {
        if (isMpinEnabledRef.current && lastBackgroundedTime.current) {
          const elapsedSec = (Date.now() - lastBackgroundedTime.current) / 1000;
          if (elapsedSec >= autoLockTimeoutRef.current) {
            setIsLocked(true);
          }
        }
        lastBackgroundedTime.current = null;
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);

    // Also handle web page visibility / switching tabs
    let cleanupWebListener: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          lastBackgroundedTime.current = Date.now();
        } else if (document.visibilityState === 'visible') {
          if (isMpinEnabledRef.current && lastBackgroundedTime.current) {
            const elapsedSec = (Date.now() - lastBackgroundedTime.current) / 1000;
            if (elapsedSec >= autoLockTimeoutRef.current) {
              setIsLocked(true);
            }
          }
          lastBackgroundedTime.current = null;
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      cleanupWebListener = () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    return () => {
      if (sub && typeof sub.remove === 'function') {
        sub.remove();
      }
      if (cleanupWebListener) cleanupWebListener();
    };
  }, []);

  const unlock = async (pin: string) => {
    const res = await SecurityService.verifyMpin(pin);
    if (res.success) {
      setIsLocked(false);
      setCooldownSeconds(0);
      lastBackgroundedTime.current = null;
    } else if (res.cooldownRemaining) {
      setCooldownSeconds(res.cooldownRemaining);
    }
    return res;
  };

  const lockApp = () => {
    if (isMpinEnabled) {
      setIsLocked(true);
    }
  };

  const setNewMpin = async (pin: string): Promise<boolean> => {
    const success = await SecurityService.setMpin(pin);
    if (success) {
      setIsMpinEnabled(true);
      setIsMpinConfigured(true);
      setIsLocked(false);
    }
    return success;
  };

  const changeMpin = async (oldPin: string, newPin: string) => {
    const res = await SecurityService.changeMpin(oldPin, newPin);
    return res;
  };

  const disableMpin = async (currentPin: string) => {
    const res = await SecurityService.disableMpin(currentPin);
    if (res.success) {
      setIsMpinEnabled(false);
      setIsLocked(false);
    }
    return res;
  };

  const resetMpin = async () => {
    await SecurityService.forceResetMpin();
    setIsMpinEnabled(false);
    setIsMpinConfigured(false);
    setIsLocked(false);
    setCooldownSeconds(0);
  };

  const updateAutoLockTimeout = async (seconds: number) => {
    await SecurityService.setAutoLockTimeout(seconds);
    setAutoLockTimeoutState(seconds);
  };

  return (
    <SecurityContext.Provider
      value={{
        isLocked,
        isMpinEnabled,
        isMpinConfigured,
        autoLockTimeout,
        cooldownSeconds,
        isLoading,
        unlock,
        lockApp,
        setNewMpin,
        changeMpin,
        disableMpin,
        resetMpin,
        updateAutoLockTimeout,
      }}
    >
      {children}
    </SecurityContext.Provider>
  );
};

export const useSecurity = () => {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
};
