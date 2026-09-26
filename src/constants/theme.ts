export const Colors = {
  // Brand
  primary: '#1E3A8A', // Deep Trust Blue
  primaryDark: '#0F172A',
  primaryLight: '#EFF6FF',
  primaryForeground: '#FFFFFF',

  // Financial Semantics (Indian Fintech Standard: Green = Jama/Received, Red = Udhaar/Due)
  creditSale: '#DC2626', // Red: Udhaar / Given to customer / Customer Due
  creditSaleLight: '#FEE2E2',
  creditSaleText: '#991B1B',

  paymentReceived: '#16A34A', // Green: Jama / Received from customer
  paymentReceivedLight: '#DCFCE7',
  paymentReceivedText: '#166534',

  advanceBalance: '#2563EB', // Blue: Customer has paid advance
  advanceLight: '#DBEAFE',

  // Neutrals & Surfaces
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceSubtle: '#F1F5F9',
  border: '#E2E8F0',
  borderDark: '#CBD5E1',

  // Typography
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',

  // Accents & Badges
  warning: '#D97706',
  warningLight: '#FEF3C7',
  warningText: '#92400E',

  info: '#0284C7',
  infoLight: '#E0F2FE',

  // Shadows
  shadow: '#000000',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 9999,
};

export const Typography = {
  h1: { fontSize: 24, fontWeight: '700' as const, lineHeight: 30 },
  h2: { fontSize: 20, fontWeight: '700' as const, lineHeight: 26 },
  h3: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },
  body: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  bodyBold: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },
  small: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },
  smallBold: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
  amountLarge: { fontSize: 28, fontWeight: '800' as const, lineHeight: 34 },
  amountMedium: { fontSize: 20, fontWeight: '700' as const, lineHeight: 24 },
  amountSmall: { fontSize: 15, fontWeight: '700' as const, lineHeight: 20 },
};
