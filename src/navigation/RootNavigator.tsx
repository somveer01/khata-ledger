import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { CustomerListScreen } from '../screens/customers/CustomerListScreen';
import { AddEditCustomerScreen } from '../screens/customers/AddEditCustomerScreen';
import { VillageListScreen } from '../screens/villages/VillageListScreen';
import { VillageDetailScreen } from '../screens/villages/VillageDetailScreen';
import { AddEntryScreen } from '../screens/transactions/AddEntryScreen';
import { AddUdhaarScreen } from '../screens/transactions/AddUdhaarScreen';
import { ReceivePaymentScreen } from '../screens/transactions/ReceivePaymentScreen';
import { ReceiptScreen } from '../screens/transactions/ReceiptScreen';
import { CustomerLedgerScreen } from '../screens/ledger/CustomerLedgerScreen';
import { ReportsScreen } from '../screens/reports/ReportsScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { Colors } from '../constants/theme';
import { useApp } from '../context/AppContext';
import { t } from '../i18n';
import { Ionicons } from '@expo/vector-icons';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const MainTabs: React.FC = () => {
  const { language } = useApp();

  return (
    <Tab.Navigator
      backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';

          if (route.name === 'DashboardTab') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'CustomersTab') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'VillagesTab') {
            iconName = focused ? 'business' : 'business-outline';
          } else if (route.name === 'ReportsTab') {
            iconName = focused ? 'bar-chart' : 'bar-chart-outline';
          } else if (route.name === 'SettingsTab') {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return <Ionicons name={iconName} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardScreen}
        options={{ tabBarLabel: t('navDashboard', language) }}
      />
      <Tab.Screen
        name="CustomersTab"
        component={CustomerListScreen}
        options={{ tabBarLabel: t('navCustomers', language) }}
      />
      <Tab.Screen
        name="VillagesTab"
        component={VillageListScreen}
        options={{ tabBarLabel: t('navVillages', language) }}
      />
      <Tab.Screen
        name="ReportsTab"
        component={ReportsScreen}
        options={{ tabBarLabel: t('navReports', language) }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{ tabBarLabel: t('navSettings', language) }}
      />
    </Tab.Navigator>
  );
};

export const RootNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="AddCustomer" component={AddEditCustomerScreen} />
      <Stack.Screen name="EditCustomer" component={AddEditCustomerScreen} />
      <Stack.Screen name="CustomerLedger" component={CustomerLedgerScreen} />
      <Stack.Screen name="VillageDetail" component={VillageDetailScreen} />
      <Stack.Screen name="AddEntry" component={AddEntryScreen} />
      <Stack.Screen name="AddUdhaar" component={AddEntryScreen} />
      <Stack.Screen name="ReceivePayment" component={AddEntryScreen} />
      <Stack.Screen name="Receipt" component={ReceiptScreen} />
    </Stack.Navigator>
  );
};
