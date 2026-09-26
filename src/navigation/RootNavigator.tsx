import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { CustomerListScreen } from '../screens/customers/CustomerListScreen';
import { AddEditCustomerScreen } from '../screens/customers/AddEditCustomerScreen';
import { VillageListScreen } from '../screens/villages/VillageListScreen';
import { VillageDetailScreen } from '../screens/villages/VillageDetailScreen';
import { AddEntryScreen } from '../screens/transactions/AddEntryScreen';
import { ReceiptScreen } from '../screens/transactions/ReceiptScreen';
import { CustomerLedgerScreen } from '../screens/ledger/CustomerLedgerScreen';
import { ReportsScreen } from '../screens/reports/ReportsScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { Colors } from '../constants/theme';
import { useApp } from '../context/AppContext';
import { t } from '../i18n';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, StyleSheet, Platform } from 'react-native';

const Tab = createBottomTabNavigator();

// Shared screens component helper
const SharedScreens = (Stack: any) => (
  <>
    <Stack.Screen name="AddCustomer" component={AddEditCustomerScreen} />
    <Stack.Screen name="EditCustomer" component={AddEditCustomerScreen} />
    <Stack.Screen name="CustomerLedger" component={CustomerLedgerScreen} />
    <Stack.Screen name="VillageDetail" component={VillageDetailScreen} />
    <Stack.Screen name="AddEntry" component={AddEntryScreen} />
    <Stack.Screen name="AddUdhaar" component={AddEntryScreen} />
    <Stack.Screen name="ReceivePayment" component={AddEntryScreen} />
    <Stack.Screen name="Receipt" component={ReceiptScreen} />
  </>
);

const DashStack = createNativeStackNavigator();
const DashStackScreen = () => (
  <DashStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <DashStack.Screen name="DashboardMain" component={DashboardScreen} />
    {SharedScreens(DashStack)}
  </DashStack.Navigator>
);

const CustStack = createNativeStackNavigator();
const CustStackScreen = () => (
  <CustStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <CustStack.Screen name="CustomersMain" component={CustomerListScreen} />
    {SharedScreens(CustStack)}
  </CustStack.Navigator>
);

const VillStack = createNativeStackNavigator();
const VillStackScreen = () => (
  <VillStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <VillStack.Screen name="VillagesMain" component={VillageListScreen} />
    {SharedScreens(VillStack)}
  </VillStack.Navigator>
);

const RepStack = createNativeStackNavigator();
const RepStackScreen = () => (
  <RepStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <RepStack.Screen name="ReportsMain" component={ReportsScreen} />
    {SharedScreens(RepStack)}
  </RepStack.Navigator>
);

const SetStack = createNativeStackNavigator();
const SetStackScreen = () => (
  <SetStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <SetStack.Screen name="SettingsMain" component={SettingsScreen} />
    {SharedScreens(SetStack)}
  </SetStack.Navigator>
);

export const RootNavigator: React.FC = () => {
  const { language } = useApp();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? Math.max(insets.bottom, 14) : Math.max(insets.bottom, 10);
  const tabHeight = 62 + bottomInset;

  return (
    <Tab.Navigator
      backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E2E8F0',
          height: tabHeight,
          paddingBottom: bottomInset,
          paddingTop: 6,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 2,
          marginBottom: 1,
        },
        tabBarIcon: ({ focused, color }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';
          if (route.name === 'DashboardTab') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'CustomersTab') iconName = focused ? 'people' : 'people-outline';
          else if (route.name === 'VillagesTab') iconName = focused ? 'business' : 'business-outline';
          else if (route.name === 'ReportsTab') iconName = focused ? 'bar-chart' : 'bar-chart-outline';
          else if (route.name === 'SettingsTab') iconName = focused ? 'settings' : 'settings-outline';

          return (
            <View style={[tabStyles.iconBox, focused && tabStyles.iconBoxFocused]}>
              <Ionicons name={iconName} size={22} color={color} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="DashboardTab" component={DashStackScreen} options={{ tabBarLabel: t('navDashboard', language) }} />
      <Tab.Screen name="CustomersTab" component={CustStackScreen} options={{ tabBarLabel: t('navCustomers', language) }} />
      <Tab.Screen name="VillagesTab" component={VillStackScreen} options={{ tabBarLabel: t('navVillages', language) }} />
      <Tab.Screen name="ReportsTab" component={RepStackScreen} options={{ tabBarLabel: t('navReports', language) }} />
      <Tab.Screen name="SettingsTab" component={SetStackScreen} options={{ tabBarLabel: t('navSettings', language) }} />
    </Tab.Navigator>
  );
};

const tabStyles = StyleSheet.create({
  iconBox: {
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxFocused: {
    backgroundColor: 'rgba(30, 58, 138, 0.09)',
  },
});
