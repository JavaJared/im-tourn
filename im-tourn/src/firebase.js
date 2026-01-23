// src/firebase.js
// Replace these values with your actual Firebase project config
// You'll get these from Firebase Console > Project Settings > Your Apps > Web App

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCEm7GtXZiO1lcKeFfWOg3Y8No4ZrEUoTM",
  authDomain: "i-m-tourn.firebaseapp.com",
  projectId: "i-m-tourn",
  storageBucket: "i-m-tourn.firebasestorage.app",
  messagingSenderId: "491434000819",
  appId: "1:491434000819:web:fc9648914a7e3ff00c8bc6",
  measurementId: "G-XLDJ2FB9QQ"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
