import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  getFirestore,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const configuredProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const useFirebaseEmulators =
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' ||
  (import.meta.env.DEV && (!configuredProjectId || configuredProjectId.startsWith('demo-')));
const projectId = configuredProjectId || (useFirebaseEmulators ? 'demo-argos-memory' : '');

if (!projectId) {
  throw new Error('Missing VITE_FIREBASE_PROJECT_ID. Configure your Firebase project in web/.env.');
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-argos-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1234567890',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1234567890:web:argos-memory-demo',
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize Firestore with offline persistent cache across multiple tabs
let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch {
  firestoreInstance = getFirestore(app);
}

export const db = firestoreInstance;
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Connect to local Firebase Emulators when explicitly configured or using a demo project in dev.
if (useFirebaseEmulators) {
  const host = window.location.hostname || '127.0.0.1';
  try {
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    connectStorageEmulator(storage, host, 9199);
    connectFunctionsEmulator(functions, host, 5001);
    console.info(`[Argos Memory] Connected to Firebase Local Emulators on host: ${host}`);
  } catch (err) {
    console.warn('[Argos Memory] Firebase Emulators already initialized or connection warning:', err);
  }
}
