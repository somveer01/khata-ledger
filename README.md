# Khata Book (खाता बुक) 📱📒

A modern, offline-first digital ledger Android application designed for Indian rural and retail shopkeepers to manage customer credit sales (*उधार* / Debit), payment collections (*जमा* / Credit), customer ledgers, and village-wise outstanding due reports.

---

## 🌟 Key Features

1. **Digital Mapping of Reference Paper Ledger**:
   - Accounts registered by **Customer Name + Village** (e.g. *शिवनन्दन सिकन्दरपुर*).
   - Strict 5-column chronological ledger: Date (*तिथि*), Particulars (*विवरण*), Debit (*नाम*), Credit (*जमा*), and Running Balance (*शेष*).
2. **Precision Integer Accounting**:
   - All financial amounts are stored and calculated strictly as integer `paise` (₹1.00 = 100 paise), avoiding floating-point rounding errors.
3. **Village Master & Outstanding Reports**:
   - Village-wise customer aggregation, total sales, collections, and net reconciled dues.
   - One-tap drill-down into village customer lists.
4. **Offline-First & Dual Database Engine**:
   - Production Cloud Firestore integration with offline cache.
   - Built-in local AsyncStorage persistence fallback with pre-seeded demo data matching the handwritten ledger reference.
5. **PDF & CSV Export**:
   - Branded customer ledger statement PDFs (`expo-print`, `expo-sharing`).
   - Village-wise due report PDFs.
   - Excel-compatible CSV exports.
6. **Payment Reminders & Receipts**:
   - Polite bilingual (Hindi/English) WhatsApp and SMS payment reminders with explicit shopkeeper action.
   - Instant shareable payment receipts upon receiving payments.
7. **Bilingual UI**:
   - Instant 1-tap switcher between English and Hindi (हिंदी).

---

## 🚀 Getting Started

### 1. Run the Development Server
```bash
npx expo start
```
- Press `a` in the terminal to launch the app on an Android device/emulator, or scan the QR code using the **Expo Go** app on Android.

### 2. Run Accounting Unit Tests
```bash
npm test
```
Runs Jest unit tests verifying:
- **Test A**: Opening balance ₹1,000 + Credit sale ₹500 - Payment ₹300 = ₹1,200.
- **Test B**: Opening balance ₹0 + Credit sale ₹2,000 - Payment ₹2,000 = ₹0.
- **Test C**: Village A with 3 customers (₹500, ₹1,000, ₹1,500) = ₹3,000.
- **Test D**: Idempotency key prevents duplicate transactions on network retry.
- **Test E**: Customer with ₹1,000 due pays ₹400 = Remaining ₹600.
- **Test F**: Floating-point drift prevention with integer paise arithmetic.

### 3. Verify Project Health & Types
```bash
npx tsc --noEmit
npx expo-doctor
```

---

## 📦 Building Standalone Android APK

To generate a standalone `.apk` installable directly on Android phones:

```bash
# Log in to your Expo account
npx eas-cli login

# Build standalone APK in EAS cloud
npx eas-cli build -p android --profile preview
```

The build will compile in the cloud and output a direct download link for `khata-book.apk`.

---

## 🔒 Firebase Security Rules

Deploy the included `firestore.rules` file to your Firebase console:
```bash
firebase deploy --only firestore:rules
```
Rules ensure full tenant isolation where retailers can only read and write documents with matching `businessId`.
