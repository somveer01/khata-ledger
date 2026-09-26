import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  Firestore 
} from 'firebase/firestore';

// Firebase credentials (overridable via environment variables)
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyA2isAsEPj2go-KseGbjvVLEQIPDhNGspE',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'khata-ledger-ebb57.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'khata-ledger-ebb57',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'khata-ledger-ebb57.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '1026719118798',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:1026719118798:web:3b2300dfdc5be8afaf279f',
};

export const isFirebaseConfigured = (): boolean => {
  return true;
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

try {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    } catch {
      db = getFirestore(app);
    }
  } else {
    app = getApp();
    db = getFirestore(app);
  }
  auth = getAuth(app);
} catch (err) {
  console.log('[Firebase Init] Running in offline local adapter mode:', err);
}

export { app, auth, db };
