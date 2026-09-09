// src/firebase.js
// Replace these values with your actual Firebase project config
// You'll get these from Firebase Console > Project Settings > Your Apps > Web App

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCEm7GtXZiO1lcKeFfWOg3Y8No4ZrEUoTM",
  authDomain: "i-m-tourn.firebaseapp.com",
  projectId: "i-m-tourn",
  storageBucket: "i-m-tourn.firebasestorage.app",
  messagingSenderId: "491434000819",
  appId: "1:491434000819:web:fc9648914a7e3ff00c8bc6",
  measurementId: "G-XLDJ2FB9QQ"
};

const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';
const app = initializeApp(useEmulators ? { ...firebaseConfig, projectId: 'demo-im-tourn', storageBucket: 'demo-im-tourn.appspot.com' } : firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
export default app;
