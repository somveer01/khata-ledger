import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { AppProvider } from './src/context/AppContext';
import { RootNavigator } from './src/navigation/RootNavigator';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const existing = document.getElementById('khata-web-input-focus-fix');
  if (!existing) {
    const style = document.createElement('style');
    style.id = 'khata-web-input-focus-fix';
    style.textContent = `
      input, textarea, select {
        outline: none !important;
        -webkit-tap-highlight-color: transparent;
      }
      input:focus, textarea:focus, select:focus {
        outline: none !important;
        box-shadow: none !important;
      }
      *:focus {
        outline: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Register PWA service worker and capture install prompt
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e: any) => {
      e.preventDefault();
      (window as any).__pwaInstallPrompt = e;
    });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/khata-ledger/sw.js', { scope: '/khata-ledger/' })
          .catch(() => {});
      });
    }
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <RootNavigator />
        </NavigationContainer>
      </AppProvider>
    </SafeAreaProvider>
  );
}
